# Contributing to Cornerstone Prototype

Thank you for your interest in contributing to the Cornerstone Prototype project! This document provides guidelines and instructions for contributing to this repository.

## Table of Contents

- [Getting Started](#getting-started)
- [Pull Request Guidelines](#pull-request-guidelines)
  - [Creating a Pull Request](#creating-a-pull-request)
  - [Marking a PR as Draft](#marking-a-pr-as-draft)
  - [Converting Draft PR to Ready for Review](#converting-draft-pr-to-ready-for-review)
- [Development Workflow](#development-workflow)
- [Code Standards](#code-standards)

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature or fix
4. Make your changes
5. Test your changes
6. Submit a pull request

## Pull Request Guidelines

### Creating a Pull Request

When creating a pull request:

1. Provide a clear title that describes the change
2. Include a detailed description of what the PR does
3. Reference any related issues
4. Ensure all tests pass
5. Keep changes focused and minimal

### Marking a PR as Draft

Draft pull requests are useful when you want to share your work in progress without requesting a formal review yet. Here's how to mark a PR as draft:

#### Using GitHub Web UI

**When creating a new PR:**
1. Click the dropdown arrow next to "Create pull request"
2. Select "Create draft pull request" instead
3. Fill in the PR details and click "Draft pull request"

**For an existing PR:**
1. Navigate to your pull request
2. In the right sidebar, under "Reviewers", look for the option to "Convert to draft"
3. Click "Convert to draft"
4. Confirm the conversion

#### Using GitHub CLI

**When creating a new PR:**
```bash
gh pr create --draft --title "Your PR title" --body "Your PR description"
```

**For an existing PR:**
```bash
gh pr ready <pr-number> --undo
```

Or convert to draft:
```bash
# First, get your PR number
gh pr list

# Then convert it to draft (note: requires GraphQL API)
gh api graphql -f query='
  mutation($id: ID!) {
    convertPullRequestToDraft(input: {pullRequestId: $id}) {
      pullRequest {
        isDraft
      }
    }
  }
' -f id=$(gh pr view <pr-number> --json id -q .id)
```

### Converting Draft PR to Ready for Review

When your draft PR is ready for review:

#### Using GitHub Web UI

1. Navigate to your draft pull request
2. Click the "Ready for review" button near the top of the PR
3. The PR will be converted to a regular PR and reviewers will be notified

#### Using GitHub CLI

```bash
gh pr ready <pr-number>
```

## Development Workflow

### For Smart Contracts (contracts/)

1. Navigate to the contracts directory:
   ```bash
   cd contracts
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile contracts:
   ```bash
   npm run compile
   ```

4. Run tests:
   ```bash
   npm test
   ```

5. Check linting:
   ```bash
   npm run lint:sol
   ```

6. Check formatting:
   ```bash
   npm run format:check
   ```

### For Frontend Application (app/)

1. Navigate to the app directory:
   ```bash
   cd app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

## Code Standards

- Follow the existing code style in the repository
- Write clear, descriptive commit messages
- Add tests for new features
- Update documentation as needed
- Ensure all CI checks pass before requesting review

## Questions?

If you have questions about contributing, feel free to:
- Open an issue for discussion
- Reach out to the maintainers
- Check existing issues and pull requests for similar questions

Thank you for contributing to Cornerstone Prototype! 🎉
