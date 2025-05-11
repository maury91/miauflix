# GitHub Actions for Miauflix

This document explains how GitHub Actions have been configured to automatically run tests, linting, and type checking for the Miauflix project.

## Available Workflows

### 1. Test Workflow (test.yml)

Runs the test suite whenever code is pushed to main/master branches or when a pull request is opened against these branches.

### 2. CI Pipeline (ci.yml)

A comprehensive workflow that includes:

- Linting
- Type checking
- Code formatting verification
- Running tests

## Networkless Testing

All tests run in a completely networkless environment using HTTP VCR in replay mode:

- Tests use pre-recorded HTTP responses stored in the `backend/test-fixtures` directory
- No actual network requests are made during CI runs
- Mock API keys are used instead of real credentials

## Test Fixtures

The tests rely on fixtures stored in the `backend/test-fixtures` directory. These fixtures contain pre-recorded API responses that allow tests to run without making actual network requests.

During development, you can record new fixtures by setting `HTTP_VCR_MODE=record` in your environment. In CI/CD environments, the mode is always set to `replay` to ensure tests are isolated from external dependencies.

## Customizing Workflows

You can modify the workflow files in the `.github/workflows` directory to adjust branch triggers, job dependencies, or other CI pipeline aspects.
