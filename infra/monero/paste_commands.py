"""Emit complete, syntax-checkable paste commands; never wallet credentials."""
import argparse
from pathlib import Path


def command_for(role: str) -> str:
    if role not in {"watch", "signer"}:
        raise ValueError("Role must be watch or signer")
    script = Path(__file__).with_name("bootstrap.sh").read_text()
    body = script.replace("role=${1:-}", f"role={role}", 1).rstrip("\n")
    delimiter = f"SEEDS_MONERO_{role.upper()}"
    # A file need not end in a newline. The closing delimiter must be its own line.
    return f"sudo bash <<'{delimiter}'\n{body}\n\n{delimiter}\n"


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("role", choices=("watch", "signer"))
    print(command_for(parser.parse_args().role), end="")