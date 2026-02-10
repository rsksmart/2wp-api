# Developer's Guide

We use Visual Studio Code for developing LoopBack and recommend the same to our
users.

## VSCode setup

Install the following extensions:

 - [eslint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
 - [prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Development workflow

### Visual Studio Code

1. Start the build task (Cmd+Shift+B) to run TypeScript compiler in the
   background, watching and recompiling files as you change them. Compilation
   errors will be shown in the VSCode's "PROBLEMS" window.

2. Execute "Run Rest Task" from the Command Palette (Cmd+Shift+P) to re-run the
   test suite and lint the code for both programming and style errors. Linting
   errors will be shown in VSCode's "PROBLEMS" window. Failed tests are printed
   to terminal output only.

### Other editors/IDEs

1. Open a new terminal window/tab and start the continuous build process via
   `npm run build:watch`. It will run TypeScript compiler in watch mode,
   recompiling files as you change them. Any compilation errors will be printed
   to the terminal.

2. In your main terminal window/tab, run `npm run test:dev` to re-run the test
   suite and lint the code for both programming and style errors. You should run
   this command manually whenever you have new changes to test. Test failures
   and linter errors will be printed to the terminal.

## Code Review with GitHub Copilot

This repository uses custom instructions for code reviews powered by GitHub Copilot. The custom instructions help ensure consistent, high-quality code reviews across all pull requests.

### Custom Instructions Location

- **Instructions file**: `.github/copilot-instructions.md`
- **Review criteria**: `.github/prompts/review-code.prompt.md`

### What the Custom Instructions Cover

The automated code review checks for:

1. **Security Issues**
   - Input validation and sanitization
   - Data exposure risks
   - Injection vulnerabilities
   - OWASP Top 10 risks

2. **Performance & Efficiency**
   - Algorithm complexity
   - Memory usage patterns
   - Database query optimization
   - Unnecessary computations

3. **Code Quality**
   - Readability and maintainability
   - Proper naming conventions
   - Function/class size and responsibility
   - Code duplication
   - **Special focus**: Avoiding nested ternary operators

4. **Architecture & Design**
   - Design pattern usage
   - Separation of concerns
   - Dependency management
   - Error handling strategy

5. **Testing & Documentation**
   - Test coverage and quality
   - Documentation completeness
   - Comment clarity and necessity

### Review Output Format

Reviews are categorized as:
- **🔴 Critical Issues** - Must fix before merge
- **🟡 Suggestions** - Improvements to consider
- **✅ Good Practices** - What's done well

### How to Use

When GitHub Copilot performs code reviews on your pull requests, it will automatically apply these custom instructions. The review will provide specific line references, clear explanations, suggested solutions with code examples, and rationale for each recommendation.
