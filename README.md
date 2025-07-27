# Total

A minimalist, web-based expense tracker.

## Local Development

1. Copy the environment file and populate it with your secrets:

  ```zsh
  cp .env.example .env.local
  ```

2. Install the dependencies:

  ```zsh
  bun install
  ```

3. Connect to a cloud database provider, or set up a local PostgreSQL database:

  ```zsh
  docker run --name postgres -e POSTGRES_PASSWORD=password -p "5432:5432" postgres
  ```

4. Run a migration to set up the database schema:

  ```zsh
  bun migrate
  ```

5. Run the local development server:

  ```zsh
  bun run dev
  ```
