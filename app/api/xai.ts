import { getServerSideConfig } from "@/app/config/server";
import {
  XAI_BASE_URL,
  ApiPath,
  ModelProvider,
  ServiceProvider,
} from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/api/auth";
import { isModelNotavailableInServer } from "@/app/utils/model";

const serverConfig = getServerSideConfig();

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[XAI Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  const authResult = auth(req, ModelProvider.XAI);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await request(req);
    return response;
  } catch (e) {
    console.error("[XAI] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

async function request(req: NextRequest) {
  const controller = new AbortController();

  // alibaba use base url or just remove the path
  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.XAI, "");

  let baseUrl = serverConfig.xaiUrl || XAI_BASE_URL;

  if (!baseUrl.startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("[Proxy] ", path);
  console.log("[Base Url]", baseUrl);

  const timeoutId = setTimeout(
    () => {
      controller.abort();
    },
    20 * 60 * 1000, // Extended to 20 minutes for XAI search and reasoning modes
  );

  const fetchUrl = `${baseUrl}${path}`;
  const fetchOptions: RequestInit = {
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
    },
    method: req.method,
    body: req.body,
    redirect: "manual",
    // @ts-ignore
    duplex: "half",
    signal: controller.signal,
  };

  // #1815 try to refuse some request to some models
  if (serverConfig.customModels && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody) as { model?: string };

      // not undefined and is false
      if (
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody?.model as string,
          ServiceProvider.XAI as string,
        )
      ) {
        return NextResponse.json(
          {
            error: true,
            message: `you are not allowed to use ${jsonBody?.model} model`,
          },
          {
            status: 403,
          },
        );
      }
    } catch (e) {
      console.error(`[XAI] filter`, e);
    }
  }
  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering - critical for streaming responses
    newHeaders.set("X-Accel-Buffering", "no");
    // Add keep-alive header to maintain connection stability
    newHeaders.set("Connection", "keep-alive");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } catch (e) {
    console.error("[XAI] Request failed:", e);
    // Enhanced error handling for streaming interruptions
    const error = e as Error;
    if (error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: true,
          message: "Request timed out. XAI search and reasoning modes may require more time. Please try again.",
        },
        { status: 408 }
      );
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
