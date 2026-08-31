# EDP Records

React + Firebase role-based admin system.

## Features
- Login / Signup / Logout
- Forgot password
- Super Admin / Admin / Employee RBAC
- Responsive sidebar
- Admin dashboard and employee dashboard
- User CRUD profile management
- Activate / deactivate users
- Profile page
- Audit logs
- Firestore security rules

## Run
```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and add your Firebase Web App configuration.

## Firebase
Enable Authentication > Email/Password and Firestore.
Deploy `firestore.rules` using Firebase CLI or paste the rules in Firestore Rules.

For the first Super Admin, create a normal account through Signup then change its `users/{uid}.role` to `super_admin` once in Firestore.

### Important
Client-side Firebase SDK cannot securely delete another user's Firebase Authentication account. The Delete action in this starter removes the Firestore profile only. For complete Auth deletion, use a trusted backend/Cloud Function with Firebase Admin SDK.

## Branch Import
Super Admin can now use **Import Branches** in the Branches tab to import `.xlsx`, `.xls`, or `.csv` files directly into Firestore. Required columns are `BRANCH NAME` and `BRANCH TYPE`; branch type must be `FULL` or `SALES OFFICE`. The importer previews the first rows and writes records in Firestore batches.

## Branch Management refresh
- Branch dashboard cards for total branches, FULL, SALES OFFICE, and static-IP records.
- Search across branch, company, account, contact, ISP, plan, address, and IP fields.
- Filters for branch type, company, and connection type.
- Cleaner Add/Edit Branch modal with grouped Branch Information, Contact & Connectivity, and Equipment sections.
- Read-only View Branch Details modal with all stored fields.
- Duplicate branch-name protection on manual entry and Excel/CSV import.
- Backward-compatible Firestore loading when older branch records do not have `createdAt`.
