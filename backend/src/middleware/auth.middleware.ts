import { Elysia } from "elysia";

import type { UserRole } from "@entities/user.entity";
import { AuthError, RoleError } from "@errors/auth.errors";
import type { AuthService } from "@services/auth/auth.service";

// Define the user type for the auth context
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export const createAuthMiddleware = (authService: AuthService) => {
  return new Elysia({
    name: "authMiddleware",
  })
    .derive({ as: "global" }, async ({ headers: { authorization } }) => {
      // Check authorization header
      if (!authorization?.startsWith("Bearer ")) {
        return {};
      }

      // Extract the token
      const token = authorization.substring("Bearer ".length);

      try {
        // Verify the token
        const payload = await authService.verifyAccessToken(token);

        // Return the user information
        return {
          user: {
            id: payload.sub,
            email: payload.email,
            role: payload.role as UserRole,
          } as AuthUser,
        };
      } catch {
        return {};
      }
    })
    .macro(({ onBeforeHandle }) => ({
      isAuth(value: UserRole | boolean) {
        if (value) {
          onBeforeHandle(({ user }) => {
            if (!user) {
              throw new AuthError();
            }
            if (typeof value === "boolean") {
              return;
            }
            if (user.role !== value) {
              throw new RoleError(value, user.email);
            }
          });
        }
      },
    }));
};
