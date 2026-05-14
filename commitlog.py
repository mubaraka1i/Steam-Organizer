#!/usr/bin/env python3
"""Analyze git commit history and AI chat logs and generate per-student reports.

For each commit the script collects the hash, author, timestamp, message, and lines
changed. It also parses the Markdown files in the chat/ directory to extract AI chat
prompts with their timestamps, elapsed times, and authors.

The script prompts the instructor to map git and chat usernames to JMU eIDs (stored in
logs/eids.json so the mapping is entered only once). Finally it writes one Markdown
file per eID in the logs/ directory, summarizing the student's commits and chat prompts
grouped by week, with a blame-based ownership summary in logs/summary.md.
"""

import subprocess
import json
import os
import re
import sys
from datetime import datetime, timedelta
from collections import defaultdict


CHAT_DIR = "chat"
LOGS_DIR = "logs"
EIDS_FILE = os.path.join(LOGS_DIR, "eids.json")
SKIP_EID = "N/A"


def get_commits():
    """Return a list of all commits in the repo with metadata and line-change counts."""
    try:
        result = subprocess.run(
            # %H=hash, %an=author name, %ae=author email, %at=unix timestamp,
            # %P=parent hashes (space-separated; >1 parent means merge commit), %s=subject
            ["git", "log", "--format=COMMIT|%H|%an|%ae|%at|%P|%s", "--numstat"],
            capture_output=True, text=True, check=True,
            encoding="utf-8", errors="backslashreplace",
        )
    except subprocess.CalledProcessError as e:
        sys.exit(f"git log failed: {e.stderr.strip()}")
    except FileNotFoundError:
        sys.exit("git not found — make sure git is installed and on your PATH.")

    commits = []
    current = None

    for line in result.stdout.splitlines():
        if line.startswith("COMMIT|"):
            if current:
                commits.append(current)
            _, hash_, username, email, ts, parents, message = line.split("|", 6)
            current = {
                "hash": hash_,
                "username": username,
                "email": email,
                "timestamp": int(ts),
                "merge": len(parents.split()) > 1,  # merge commits have multiple parents
                "message": message,
                "added": 0,
                "removed": 0,
                "files": 0,
            }
        elif current and "\t" in line:
            # numstat rows: "<added>\t<removed>\t<filepath>"
            # Binary files report "-" instead of a number; skip them.
            added, removed, _ = line.split("\t", 2)
            if added != "-":
                current["added"] += int(added)
            if removed != "-":
                current["removed"] += int(removed)
            current["files"] += 1

    if current:
        commits.append(current)

    return commits


def parse_chat_files():
    """Parse all Markdown files in chat/ and return a list of prompt records."""
    if not os.path.isdir(CHAT_DIR):
        return []

    prompts = []
    for filename in sorted(os.listdir(CHAT_DIR)):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(CHAT_DIR, filename)
        with open(filepath, encoding="utf-8", errors="backslashreplace") as f:
            content = f.read()

        # Split on each prompt anchor so each section starts at "## <a name="prompt-"
        sections = re.split(r'(?=## <a name="prompt-)', content)
        for section in sections:
            if not section.startswith('## <a name="prompt-'):
                continue

            ts_match = re.search(r'🕒 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})', section)
            if not ts_match:
                continue
            dt = datetime.strptime(ts_match.group(1), "%Y-%m-%d %H:%M:%S")

            elapsed_match = re.search(r'Total elapsed: (\d+) min,?\s+(\d+) sec', section)
            elapsed_secs = 0
            if elapsed_match:
                elapsed_secs = int(elapsed_match.group(1)) * 60 + int(elapsed_match.group(2))

            # Capture username and the user's text up to the assistant reply
            user_match = re.search(
                r'### 👤 User \(([^)]+)\)\n\n(.*?)(?=\n### 🤖|\Z)',
                section, re.DOTALL,
            )
            if not user_match:
                continue

            prompts.append({
                "timestamp": int(dt.timestamp()),
                "elapsed_secs": elapsed_secs,
                "username": user_match.group(1),
                "prompt": user_match.group(2).strip(),
            })

    return prompts


def load_eids():
    """Load the saved username-to-eID mapping from disk, or return an empty dict."""
    if os.path.exists(EIDS_FILE):
        with open(EIDS_FILE) as f:
            return json.load(f)
    return {}


def save_eids(mapping):
    """Write the username-to-eID mapping to disk."""
    with open(EIDS_FILE, "w") as f:
        json.dump(mapping, f, indent=2)
    print(f"Saved eID mapping to {EIDS_FILE}")


def prompt_for_eids(usernames, existing, email_map):
    """Prompt for an eID for each git or chat username not already in the mapping."""
    mapping = dict(existing)
    new_usernames = [u for u in usernames if u not in mapping]

    if not new_usernames:
        return mapping

    known_eids = sorted(set(e for e in mapping.values() if e and e != SKIP_EID))
    if known_eids:
        print(f"\nAlready mapped eIDs: {', '.join(known_eids)}")

    print("\nNew username(s) found. Enter the JMU eID for each.")
    print("(If two usernames belong to the same person, give them the same eID.)")
    print("(Leave blank to skip.)\n")

    for username in sorted(new_usernames):
        email = email_map.get(username, "")
        label = f"'{username}' ({email})" if email else f"'{username}'"
        eid = input(f"  eID for {label}: ").strip() or SKIP_EID
        mapping[username] = eid

    return mapping


def get_github_url():
    """Return the GitHub repo URL derived from the 'origin' remote, or None."""
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True, text=True,
        encoding="utf-8", errors="backslashreplace",
    )
    if result.returncode != 0:
        return None
    url = result.stdout.strip().removesuffix(".git")
    # Normalize SSH remote (git@github.com:owner/repo) to HTTPS URL
    if url.startswith("git@github.com:"):
        return "https://github.com/" + url[len("git@github.com:"):]
    if "github.com" in url:
        return url
    return None


def week_start(timestamp):
    """Return the Sunday that begins the week containing this Unix timestamp."""
    dt = datetime.fromtimestamp(timestamp)
    # weekday() returns 0=Mon … 6=Sun; this maps Sun→0, Mon→1 … Sat→6 days back to Sunday
    sunday = dt - timedelta(days=(dt.weekday() + 1) % 7)
    return sunday.replace(hour=0, minute=0, second=0, microsecond=0)


def format_week(dt):
    """Format a datetime as 'Month D, YYYY' (no leading zero on the day)."""
    return f"{dt.strftime('%B')} {dt.day}, {dt.strftime('%Y')}"


def format_elapsed(secs):
    """Format a duration in seconds as 'Xm Ys'."""
    return f"{secs // 60}m {secs % 60}s"


def get_blame_stats(eid_map):
    """Run git blame on every tracked file and return per-eID line/file ownership stats.

    Returns (by_eid, codebase_totals) where by_eid maps each eID to a dict of
    {lines, files, src_lines, src_files} and codebase_totals holds repo-wide counts.
    A file is credited to the eID that owns strictly more than half its lines.
    """
    print("Running git blame on tracked files...")
    ls = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True, encoding="utf-8", errors="backslashreplace")
    files = ls.stdout.splitlines()

    eid_lines: dict[str, int] = defaultdict(int)
    eid_majority_files: dict[str, int] = defaultdict(int)
    eid_src_lines: dict[str, int] = defaultdict(int)
    eid_src_majority_files: dict[str, int] = defaultdict(int)
    total_lines = 0
    total_src_lines = 0
    src_files = [f for f in files if f.startswith("src/")]

    # Extensions treated as binary — git blame succeeds on these but counts garbage lines
    BINARY_EXTENSIONS = {
        ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif", ".svg",
        ".pdf", ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
        ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".aac", ".webm", ".mov", ".avi",
        ".woff", ".woff2", ".ttf", ".otf", ".eot",
        ".exe", ".dll", ".so", ".dylib", ".bin", ".dat",
        ".db", ".sqlite", ".pyc",
    }
    LINE_LIMIT = 5000  # skip files longer than this (generated data, minified bundles, etc.)

    for filepath in files:
        if os.path.splitext(filepath)[1].lower() in BINARY_EXTENSIONS:
            continue
        n = 0
        try:
            with open(filepath, encoding="utf-8", errors="backslashreplace") as fh:
                for n, _ in enumerate(fh, 1):
                    if n > LINE_LIMIT:
                        break
        except OSError:
            continue
        if n > LINE_LIMIT:
            continue
        blame = subprocess.run(
            ["git", "blame", "--porcelain", filepath],
            capture_output=True, text=True,
            encoding="utf-8", errors="backslashreplace",
        )
        # git blame exits non-zero for binary files not caught by the extension list
        if blame.returncode != 0:
            continue

        current_hash = None
        hash_to_author: dict[str, str] = {}
        file_author_lines: dict[str, int] = defaultdict(int)

        for line in blame.stdout.splitlines():
            # Porcelain format: hash lines start with a 40-char hex digest.
            # Metadata lines (author, committer, …) and content lines (\t…) do not.
            if len(line) > 40 and line[40] == " " and all(c in "0123456789abcdef" for c in line[:40]):
                current_hash = line[:40]
            elif line.startswith("author ") and not line.startswith("author-"):
                # Each unique commit hash is accompanied by metadata on first appearance
                if current_hash:
                    hash_to_author[current_hash] = line[7:]
            elif line.startswith("\t"):
                # Every \t-prefixed line represents exactly one line of file content
                author = hash_to_author.get(current_hash or "", "Unknown")
                file_author_lines[author] += 1

        file_total = sum(file_author_lines.values())
        total_lines += file_total
        in_src = filepath.startswith("src/")
        if in_src:
            total_src_lines += file_total
        if not file_total:
            continue

        # Map per-author line counts to eIDs
        file_eid_lines: dict[str, int] = defaultdict(int)
        for author, count in file_author_lines.items():
            e = eid_map.get(author, author)
            file_eid_lines[e] += count
            eid_lines[e] += count
            if in_src:
                eid_src_lines[e] += count

        if not file_eid_lines:
            continue

        # Credit the file to whichever eID owns strictly more than half its lines
        majority_eid = max(file_eid_lines, key=lambda e: file_eid_lines[e])
        if file_eid_lines[majority_eid] > file_total / 2:
            eid_majority_files[majority_eid] += 1
            if in_src:
                eid_src_majority_files[majority_eid] += 1

    by_eid = {
        e: {
            "lines": eid_lines[e],
            "files": eid_majority_files.get(e, 0),
            "src_lines": eid_src_lines.get(e, 0),
            "src_files": eid_src_majority_files.get(e, 0),
        }
        for e in eid_lines
    }
    codebase_totals = {
        "lines": total_lines,
        "files": len(files),
        "src_lines": total_src_lines,
        "src_files": len(src_files),
    }
    return by_eid, codebase_totals


def write_summary(all_summary, codebase_totals):
    """Write logs/summary.md with the group-wide contribution table."""
    total_commits = sum(s["commits"] for s in all_summary.values())
    total_prompts = sum(s["prompts"] for s in all_summary.values())

    def pct(n, total):
        return f"{n / total * 100:.0f}%" if total else "0%"

    path = os.path.join(LOGS_DIR, "summary.md")
    with open(path, "w") as f:
        f.write("# Summary\n\n")
        f.write("| eID | Commits | Prompts | Lines | Files | Lines in src | Files in src |\n")
        f.write("| --- | ------: | ------: | ----: | ----: | -----------: | -----------: |\n")
        for e in sorted(all_summary):
            s = all_summary[e]
            f.write(
                f"| {"Other" if e == SKIP_EID else e} | {s['commits']} ({pct(s['commits'], total_commits)})"
                f" | {s['prompts']} ({pct(s['prompts'], total_prompts)})"
                f" | {s['lines']} ({pct(s['lines'], codebase_totals['lines'])})"
                f" | {s['files']} ({pct(s['files'], codebase_totals['files'])})"
                f" | {s['src_lines']} ({pct(s['src_lines'], codebase_totals['src_lines'])})"
                f" | {s['src_files']} ({pct(s['src_files'], codebase_totals['src_files'])}) |\n"
            )
        f.write(
            f"| **Total** | **{total_commits}**"
            f" | **{total_prompts}**"
            f" | **{codebase_totals['lines']}**"
            f" | **{codebase_totals['files']}**"
            f" | **{codebase_totals['src_lines']}**"
            f" | **{codebase_totals['src_files']}** |\n\n"
        )
        f.write(
            "## Metrics\n\n"
            "- **Commits**: number of non-merge commits in the git history\n"
            "- **Prompts**: number of AI chat prompts in the `chat/` directory\n"
            "- **Lines**: lines currently attributed to this eID via `git blame`\n"
            "- **Files**: files where this eID wrote the majority of current lines\n"
            "- **Lines in src**: same as Lines, restricted to the `src/` directory\n"
            "- **Files in src**: same as Files, restricted to the `src/` directory\n"
        )
    print(f"  {path}")


def write_markdown(eid, commits_by_week, chats_by_week, github_url):
    """Write a Markdown contribution report for one eID."""
    path = os.path.join(LOGS_DIR, f"{eid}.md")
    all_weeks = sorted(set(commits_by_week) | set(chats_by_week))

    with open(path, "w") as f:
        f.write(f"# {eid}\n\n")

        for week in all_weeks:
            f.write(f"## Week of {format_week(week)}\n\n")

            week_commits = commits_by_week.get(week, [])
            if week_commits:
                f.write("### Commits\n\n")
                f.write("| Hash | Timestamp | Files | Added | Removed | Message |\n")
                f.write("| ---- | --------- | ----: | ----: | ------: | ------- |\n")
                for c in sorted(week_commits, key=lambda x: x["timestamp"]):
                    dt = datetime.fromtimestamp(c["timestamp"])
                    hash_cell = (
                        f"[`{c['hash'][:7]}`]({github_url}/commit/{c['hash']})"
                        if github_url else f"`{c['hash'][:7]}`"
                    )
                    f.write(
                        f"| {hash_cell} | {dt.strftime('%Y-%m-%d %H:%M:%S')}"
                        f" | {c['files']} | {c['added']} | {c['removed']}"
                        f" | {c['message']} |\n"
                    )
                f.write("\n")

            week_chats = chats_by_week.get(week, [])
            if week_chats:
                f.write("### Prompts\n\n")
                f.write("| Timestamp | Elapsed | Lines | Length | Prompt |\n")
                f.write("| --------- | ------: | ----: | -----: | ------ |\n")
                for p in sorted(week_chats, key=lambda x: x["timestamp"]):
                    dt = datetime.fromtimestamp(p["timestamp"])
                    num_lines = len(p["prompt"].splitlines())
                    num_chars = len(p["prompt"])
                    # Take first line of prompt, truncate, and escape pipe characters
                    first_line = p["prompt"].split("\n")[0].strip().replace("|", "\\|")
                    if len(first_line) > 72:
                        first_line = first_line[:72] + "…"
                    f.write(
                        f"| {dt.strftime('%Y-%m-%d %H:%M:%S')}"
                        f" | {format_elapsed(p['elapsed_secs'])}"
                        f" | {num_lines} | {num_chars}"
                        f" | {first_line} |\n"
                    )
                f.write("\n")

    print(f"  {path}")


def main():
    """Entry point: collect commits and chats, resolve eIDs, run blame, and write reports."""
    print("Analyzing git contributions...")
    os.makedirs(LOGS_DIR, exist_ok=True)

    commits = get_commits()
    if not commits:
        sys.exit("No commits found.")

    chats = parse_chat_files()

    git_usernames = sorted({c["username"] for c in commits})
    chat_usernames = sorted({p["username"] for p in chats})
    all_usernames = sorted(set(git_usernames) | set(chat_usernames))
    print(f"Found {len(commits)} commit(s) from {len(git_usernames)} git username(s): {', '.join(git_usernames)}")
    if chats:
        print(f"Found {len(chats)} chat prompt(s) from {len(chat_usernames)} chat username(s): {', '.join(chat_usernames)}")

    # Use the most recent email seen for each git username (chat users may not have one)
    email_map = {c["username"]: c["email"] for c in commits}

    existing = load_eids()
    eid_map = prompt_for_eids(all_usernames, existing, email_map)
    save_eids(eid_map)

    # Group commits by eID then by the Sunday that starts their week
    by_eid_commits: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    for commit in commits:
        eid = eid_map.get(commit["username"], commit["username"])
        by_eid_commits[eid][week_start(commit["timestamp"])].append(commit)

    # Group chats by eID then by week
    by_eid_chats: dict[str, dict] = defaultdict(lambda: defaultdict(list))
    for chat in chats:
        eid = eid_map.get(chat["username"], chat["username"])
        by_eid_chats[eid][week_start(chat["timestamp"])].append(chat)

    blame_stats, codebase_totals = get_blame_stats(eid_map)

    # Combine commit counts, chat prompt counts, and blame stats into one summary dict
    all_eids = set(by_eid_commits) | set(by_eid_chats)
    all_summary = {
        e: {
            "commits": sum(1 for cs in by_eid_commits[e].values() for c in cs if not c["merge"]),
            "prompts": sum(len(ps) for ps in by_eid_chats[e].values()),
            "lines": blame_stats.get(e, {}).get("lines", 0),
            "files": blame_stats.get(e, {}).get("files", 0),
            "src_lines": blame_stats.get(e, {}).get("src_lines", 0),
            "src_files": blame_stats.get(e, {}).get("src_files", 0),
        }
        for e in all_eids
    }

    github_url = get_github_url()

    print("\nGenerating markdown files:")
    write_summary(all_summary, codebase_totals)
    for eid in sorted(all_eids):
        if eid == SKIP_EID:
            continue
        write_markdown(eid, by_eid_commits[eid], by_eid_chats[eid], github_url)

    print("\nDone.")


if __name__ == "__main__":
    main()
