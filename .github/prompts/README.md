# GitHub Copilot Prompts

This directory contains custom prompt templates used by GitHub Copilot for various automated tasks.

## Available Prompts

### review-code.prompt.md

This prompt defines the code review criteria and standards for the 2wp-api project. It is referenced by the `.github/copilot-instructions.md` file and is automatically applied when GitHub Copilot performs code reviews.

**Purpose**: Ensure consistent, comprehensive, and constructive code reviews across all pull requests.

**Key Areas Covered**:
- Security analysis (OWASP Top 10, input validation, injection vulnerabilities)
- Performance optimization
- Code quality and readability
- Architecture and design patterns
- Testing and documentation standards

**Special Requirements**:
- Focus on readability
- Avoid nested ternary operators
- Provide actionable feedback with code examples
- Categorize issues by severity (Critical, Suggestions, Good Practices)

## How It Works

1. The `.github/copilot-instructions.md` file references the prompts in this directory
2. When GitHub Copilot performs automated tasks (like code reviews), it loads the relevant prompt
3. The prompt guides Copilot to provide consistent, high-quality output

## Modifying Prompts

When updating prompts:
1. Test the changes thoroughly to ensure they produce the desired output
2. Update this README if you add new prompts
3. Document any special requirements or focus areas
4. Ensure backward compatibility with existing workflows

## Related Files

- `.github/copilot-instructions.md` - Main instructions file that references these prompts
- `DEVELOPING.md` - Developer guide that documents the code review process
