import { Elysia } from "elysia";
import { AuthService } from "@services/auth/auth.service";
import { UserRole } from "@entities/user.entity";

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
      } catch (error) {
        return {};
      }
    })
    .macro(({ onBeforeHandle }) => ({
      isAuth(value: boolean) {
        if (value) {
          onBeforeHandle(({ error, user, set }) => {
            if (!user) {
              throw error(401, "Unauthorized: Authentication required");
            }
          });
        }
      },
    }));
};
