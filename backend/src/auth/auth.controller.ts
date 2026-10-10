import { Body, Controller, Get, Headers, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { response } from "../common/api-response";
import type { ApiResponseDto } from "../dto";
import type { AuthSessionDto, LoginRequestDto, LogoutDto } from "./auth.dto";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() body: LoginRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<AuthSessionDto>> {
    const ipAddress = req.ip ?? req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const result = await this.authService.login(body, ipAddress, userAgent);
    res.setHeader("set-cookie", this.authService.authCookie(result.token, result.maxAgeSeconds));

    return response(result.session);
  }

  @Get("session")
  async session(@Headers("cookie") cookieHeader: string | undefined): Promise<ApiResponseDto<AuthSessionDto>> {
    await this.authService.validateDurableSession(cookieHeader);
    const sessionData = await this.authService.session(cookieHeader);
    return response(sessionData);
  }

  @Post("logout")
  async logout(
    @Headers("cookie") cookieHeader: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<ApiResponseDto<LogoutDto>> {
    await this.authService.logout(cookieHeader);
    res.setHeader("set-cookie", this.authService.clearCookie());

    return response({
      authenticated: false,
      loggedOut: true
    });
  }
}
