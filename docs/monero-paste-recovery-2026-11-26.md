# Monero paste-command recovery

Bobby's uploaded EC2 terminal transcript shows the generated paste block ended with the closing `SEEDS_MONERO_WATCH` delimiter appended to the final `printf`, rather than on a new line. Bash therefore stayed at its continuation prompt; Ctrl+C cancelled the incomplete input before the enclosed installer ran. Running as root could not resolve this formatting issue.

The source bootstrap is unchanged: no permissions, wallet code, binary/hash, host security or financial activation changed. `infra/monero/paste_commands.py` now emits the source bootstrap as a complete watch/signer heredoc with explicit separating and terminal newlines, independently of whether the source file ends in a newline. Invalid roles are refused.

`test_paste_commands.py` syntax-checks both complete wrapped blocks by safely replacing the install invocation with `bash -n`. It asserts both success and zero warnings: bash can return zero even for a missing heredoc terminator. It never executes privileged installation commands. The existing five proxy allowlist tests remain.

The corrected v2 operator document replaces both generated blocks, preserves the setup instructions and includes Ctrl+C recovery. Operator must paste the entire corrected EC2 section including its final standalone marker, then press Enter. No installation or sync on Bobby's real EC2 machine has been verified yet.

The shared file includes the exact latest code commit. The earlier Monero deployment audit and host/key-activation requirements remain; nothing was published.

## Rule and sibling check

A complete pasted setup must finish accepting input and run, not leave the terminal waiting for a missing final line.

| Place | Checked result |
| --- | --- |
| EC2 watch paste block in the original operator document | Missing standalone closing line reproduced as a bash warning; corrected in v2 and syntax-checked |
| DigitalOcean signer paste block in the same document | Same defect; corrected in v2 and syntax-checked |
| EC2 sync-progress command block | Read and syntax-checked, no missing marker |
| Direct `infra/monero/bootstrap.sh` | Read and syntax-checked; its internal service heredoc closes correctly; unchanged |
| Wallet, proxy, daemon and nginx definitions in `infra/monero/install.sh` | Full source read; all four internal heredocs close correctly; syntax-checked; unchanged |
| Downloaded `monero-deployment.zip` | Read archive members and compared bootstrap, installer, proxy and README bytes with checked source; matching, unaffected |
| Deployment README direct setup calls | Full source read; calls scripts directly, no generated paste wrapper; unchanged |
| `/api/public/jobs/monero` background job | Source read; authenticates job and calls wallet advancement, does not emit any setup commands; unchanged |
| App screens and migrations | Search found no Monero paste-wrapper/bootstrapping snippets; no corresponding screen/database-function changes needed |

The original operator document is retained as an old version; v2 supersedes its broken blocks. No settled records, permissions, settings or example data changed. Verification: 8 Python tooling tests pass; three v2 shell blocks and both source installers parse without warnings. Actual EC2 installation still needs the operator to rerun the corrected block.