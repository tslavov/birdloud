import type { IncomingHttpHeaders } from "node:http";
import type { AuthService, AuthSession } from "../../src/lib/auth.js";

export class TestAuthService implements AuthService {
  readonly handledRequests: Request[] = [];

  constructor(
    private readonly session: AuthSession | null,
    private readonly handler: (request: Request) => Promise<Response> = async () =>
      new Response(null, { status: 404 })
  ) {}

  handle(request: Request): Promise<Response> {
    this.handledRequests.push(request);
    return this.handler(request);
  }

  getSession(_headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    return Promise.resolve(this.session);
  }
}

export function authenticatedAuthService(
  userId: string,
  role = "ORGANIZER"
): TestAuthService {
  return new TestAuthService({
    user: {
      id: userId,
      role
    }
  });
}

export function unauthenticatedAuthService(): TestAuthService {
  return new TestAuthService(null);
}
