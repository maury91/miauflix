<!-- 34c5cbd8-ace1-4f78-9a99-5d8d29635d40 9f390fdf-03ff-4aea-b750-e7b33430e3a5 -->
# Extract User Type in AuthService

## Analysis

The user object shape `{ id: string; email: string; displayName: string | null; role: UserRole }` is duplicated in:

- `AuthResult.user` interface (auth.service.ts line 37-42)
- `getSessionInfo` return type (auth.service.ts line 429-434)

`UserDto` already exists in `backend/src/routes/auth.types.ts` with the exact same shape. We should use this existing type instead of duplicating it.

## Changes Required

### 1. Update AuthResult to use UserDto

**File: `backend/src/services/auth/auth.service.ts`**

- Import `UserDto` from `@routes/auth.types` (or appropriate import path)
- Replace the inline user type in `AuthResult.user` with `UserDto`

### 2. Update getSessionInfo return type

**File: `backend/src/services/auth/auth.service.ts`**

- Replace the inline user type in `getSessionInfo` return type with `UserDto`

## Note

This creates a dependency from services to routes, but since `UserDto` is a data transfer object used for API responses, this is acceptable. The alternative would be to move `UserDto` to a shared types location, but that's a larger refactoring.