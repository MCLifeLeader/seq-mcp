## Contributing to Developer-Toolbox

Thanks for your interest in contributing! This repository is a curated collection of scripts, templates and examples for developer tooling (containers, DevOps pipelines, Terraform, snippets and small helpers). The guidance below will help your contribution be reviewed and merged quickly.

### Table of contents
- How to contribute
- Reporting bugs & requesting features
- Development workflow (branching & PRs)
- Commit messages
- Code style and tests
- Pull request checklist
- Security & responsibly disclosure
- Accessibility & inclusions
- License

### How to contribute

Pick one of the ways below:

- Open an issue to discuss a change before implementing it (recommended for anything non-trivial).
- Open a small, focused pull request if you have a clear fix or addition (examples, docs, scripts).
- Suggest improvements via Discussions (if enabled) for broader design conversations.

Be respectful and constructive. This project follows the repository's `CODEOWNERS` and default review process.

### Reporting bugs & requesting features

- Use the Issues tab and choose the appropriate template if available.
- For bugs, include:
  - A short summary of the problem
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, shell, versions) if relevant
  - Small reproduction or sample files when possible

For feature requests, explain the problem you want solved and a suggested approach.

### Development workflow (branching & PRs)

- Fork the repository and create a branch from `main` with a clear name, e.g.:

```
# PowerShell example
git checkout -b fix/short-description
```

- Keep changes small and focused. One logical change per pull request makes review easier.
- Rebase or merge from `main` to keep your branch up to date before creating a PR.
- Target branch: `main` (the default branch). If you are working on a large change, open an issue first.

### Commit messages

Follow a simple, conventional style to make history easier to scan. Prefer short, imperative messages:

- Good: "Add docker-compose service for local mssql"
- Good: "Fix typo in README"
- Bad: "fixed some stuff"

For larger changes, add a body explaining why the change was made and any migration notes.

Conventional Commits are welcome but not strictly required. If you use them, a short subject line and optional body are sufficient.

### Code style and tests

- Keep styles consistent with nearby files.
- Scripts should be idempotent when possible and follow platform conventions (PowerShell scripts for Windows helpers, POSIX for containers where appropriate).
- Add tests or a short verification step when modifying behaviorally important code. Small docs or script changes should include a quick "How I tested this" note in the PR description.

If you add a new script or tool that requires dependencies, include a short "Try it" section in the README or the script header with commands to run.

### Pull request checklist

Before marking a PR ready for review, make sure:

- [ ] The PR has a clear title and description explaining the change and why.
- [ ] Changes are small and scoped to a single purpose.
- [ ] Any new files include an explanation or README snippet showing how to use them.
- [ ] You updated any relevant documentation (top-level README or folder readme).
- [ ] You ran quick local validation (syntax check / smoke test) and included results if non-trivial.
- [ ] No secrets or credentials are present in the changes. Use environment variables or secret stores.

Maintainers may request changes; please address feedback and push updates to the same branch.

### Security & responsible disclosure

If you discover a security issue, please do not open a public issue. Contact the maintainers privately using the email address in the repository owner profile or follow any security policy in this repo. Include clear reproduction steps and affected components.

### Accessibility & inclusions

When adding UI or documentation, follow accessibility best-practices where applicable. Keep language inclusive and people-first. If you add UI modules or examples, document keyboard interaction and screen reader considerations.

### License

By contributing, you agree that your contributions will be licensed under the repository's license (see `LICENSE`).

### Thank you

Thanks for helping improve Developer-Toolbox — your contributions make this project better for everyone.
