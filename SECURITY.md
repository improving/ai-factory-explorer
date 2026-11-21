# Security policy

## Supported versions

The `main` branch and the latest release receive fixes.

## Report a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting on this repository:

1. Open the **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, the version or commit, and the steps to reproduce it.

You will get an acknowledgement, and a fix or a mitigation plan, through that private report.

## Scope

The application is a static, single-file web page. It makes no request of its own and it has no
server-side component. The relevant classes are:

- a script injection through a document that the Library renders, or through a URL parameter;
- a link that leaves the app or loads a remote resource;
- a secret or a private identifier committed to the repository.

The container image serves the built file behind nginx; report an image or base-image problem in
the same way.

## What is not a vulnerability

- The explorer does not connect to a real cluster, so it holds no credentials.
- The values marked `assumed` are model values, not claims about a live site.
