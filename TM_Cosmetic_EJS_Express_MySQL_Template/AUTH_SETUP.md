# Login & Sign Up setup

This project now includes email/password registration, sign in, sign out, password hashing with bcryptjs, and a Pink Beauty-style account dropdown in the header.

## Setup
1. Extract the project ZIP and run `npm install`.
2. Import the updated `database/tm_cosmetic.sql` into MySQL. The script creates the `users` table along with the storefront tables.
3. Copy `.env.example` to `.env`; set your MySQL credentials and a long random `SESSION_SECRET`.
4. Start with `npm run dev` and open `http://localhost:3000`.
5. Click the person/account icon in the header. The dropdown has **Sign In** and **Sign Up** links.

## Routes
- `GET /login` and `POST /login`
- `GET /signup` and `POST /signup`
- `POST /logout`

Passwords are stored as bcrypt hashes, never as plain text. Sessions use Express's default in-memory store for local development. Before production deployment, configure a persistent session store (for example, a MySQL-backed store), HTTPS, CSRF protection, login rate limiting, and account recovery.

The `/account` link is a visual placeholder for a future customer account/profile page.
