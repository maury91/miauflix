# Bun and TypeScript Project

This project is a simple application built using Bun and TypeScript. It serves as a starting point for developing applications with these technologies.

## Project Structure

```
bun-ts-project
├── .devcontainer
│   ├── devcontainer.json
│   └── Dockerfile
├── src
│   ├── app.ts
│   └── types
│       └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Getting Started

To get started with this project, follow the instructions below:

### Prerequisites

- Ensure you have [Bun](https://bun.sh/) installed on your machine.
- Docker should be installed and running for the development container.

### Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd bun-ts-project
   ```

2. Open the project in your code editor.

3. If you are using the development container, you can open the project in the container by using the command palette and selecting "Remote-Containers: Open Folder in Container".

### Running the Application

To run the application, use the following command:

```
bun run src/app.ts
```

### Scripts

You can add additional scripts in the `package.json` file to automate tasks.

### Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or features.

### License

This project is licensed under the MIT License. See the LICENSE file for more details.