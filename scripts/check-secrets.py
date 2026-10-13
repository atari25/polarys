"""Check staged/tracked content without printing credential values."""
import re
import subprocess
import sys

PATTERNS = {
    "Google API key": rb"AIza[0-9A-Za-z_-]{35}",
    "Supabase secret key": rb"sb_secret_[A-Za-z0-9_-]{20,}",
    "GitHub token": rb"(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}",
    "private key": rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
}

def main():
    files = subprocess.check_output(["git", "ls-files", "-z"]).split(b"\0")
    found = False
    for raw_path in filter(None, files):
        path = raw_path.decode("utf-8")
        # Read the index: unstaged edits must not conceal a staged secret.
        data = subprocess.check_output(["git", "show", ":" + path])
        for label, pattern in PATTERNS.items():
            if re.search(pattern, data):
                print(f"Blocked: {label} in {path} (value withheld)")
                found = True
    if not found:
        print("No matching credentials in the Git index.")
    return 1 if found else 0

if __name__ == "__main__":
    sys.exit(main())
