import { User } from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";
import { userCan } from "../services/permissions.js";

function unauthorized(message = "Authentication is required.") {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

export async function requireAuth(request, _response, next) {
  try {
    const [scheme, token] = (request.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized();

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select("+tokenVersion").populate("business");
    if (!user || user.status !== "active" || user.tokenVersion !== payload.version) {
      throw unauthorized("This session is no longer valid.");
    }

    request.auth = { user, business: user.business };
    next();
  } catch (error) {
    if (!error.statusCode) error.statusCode = 401;
    next(error);
  }
}

export function allowRoles(...roles) {
  return (request, _response, next) => {
    if (!request.auth?.user || !roles.includes(request.auth.user.role)) {
      const error = new Error("You do not have permission to perform this action.");
      error.statusCode = 403;
      return next(error);
    }
    return next();
  };
}

export function requirePermission(permission) {
  return (request, _response, next) => {
    if (!request.auth?.user || !userCan(request.auth.user, permission)) {
      const error = new Error("You do not have permission to perform this action.");
      error.statusCode = 403;
      return next(error);
    }
    return next();
  };
}
