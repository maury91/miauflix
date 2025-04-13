import { Elysia, t } from "elysia";
import { AuthService } from "@services/auth/auth.service";
import { createAuthMiddleware } from "@middleware/auth.middleware";
import { UserRole } from "@entities/user.entity";
import { LoginError } from "src/errors/auth.errors";

export const createAuthRoutes = (authService: AuthService) => {
  return new Elysia()
    .use(createAuthMiddleware(authService))
    .group("/auth", (app) =>
      app
        .post(
          "/login",
          async ({ body: { email, password }, set }) => {
            const user = await authService.validateUser(email, password);
            if (!user) {
              set.status = 401;
              throw new LoginError(email);
            }
            const tokens = await authService.generateTokens(user);
            return tokens;
          },
          {
            body: t.Object({
              email: t.String({ format: "email" }),
              password: t.String(),
            }),
            isPublic: true,
          },
        )
        .post(
          "/refresh",
          async ({ body }: { body: { refreshToken: string } }) => {
            const { refreshToken } = body;
            const tokens = await authService.refreshAccessToken(refreshToken);
            if (!tokens) {
              throw new Error("Invalid refresh token");
            }
            return tokens;
          },
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
            isPublic: true,
          },
        )
        .post(
          "/logout",
          async ({ body }: { body: { refreshToken: string } }) => {
            const { refreshToken } = body;
            await authService.logout(refreshToken);
            return { message: "Logged out successfully" };
          },
          {
            body: t.Object({
              refreshToken: t.String(),
            }),
          },
        )
        .post(
          "/users",
          async ({
            body,
            user,
          }: {
            body: { email: string; password: string; role: UserRole };
            user: { role: UserRole };
          }) => {
            if (user.role !== UserRole.ADMIN) {
              throw new Error(
                "Forbidden: Only administrators can create users",
              );
            }
            const { email, password, role } = body;
            const newUser = await authService.createUser(email, password, role);
            return {
              id: newUser.id,
              email: newUser.email,
              role: newUser.role,
            };
          },
          {
            isAuth: UserRole.ADMIN,
            body: t.Object({
              email: t.String({ format: "email" }),
              password: t.String({ minLength: 8 }),
              role: t.Enum(UserRole),
            }),
          },
        ),
    );
};
