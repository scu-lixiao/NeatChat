import { getServerSideConfig } from "@/app/config/server";
import {
  DEEPSEEK_BASE_URL,
  ApiPath,
  DeepSeek,
  ModelProvider,
  ServiceProvider,
} from "@/app/constant";
import { prettyObject } from "@/app/utils/format";
import { NextRequest, NextResponse } from "next/server";
import { auth, parseApiKey } from "@/app/api/auth";
import { joinDeepSeekUrl } from "@/app/utils/deepseek";
import { isModelNotavailableInServer } from "@/app/utils/model";
import { shouldRequestStreamUsage } from "@/app/utils/token-usage";

const serverConfig = getServerSideConfig();

export async function handle(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  console.log("[DeepSeek Route] params ", params);

  if (req.method === "OPTIONS") {
    return NextResponse.json({ body: "OK" }, { status: 200 });
  }

  // Without the user's own key, auth() would answer with the server key's
  // balance, which only ENABLE_BALANCE_QUERY makes public
  const subpath = req.nextUrl.pathname.replaceAll(ApiPath.DeepSeek, "");
  if (
    subpath === `/${DeepSeek.BalancePath}` &&
    serverConfig.hideBalanceQuery &&
    !hasUserApiKey(req)
  ) {
    return NextResponse.json(
      { error: true, message: "balance query is disabled on this server" },
      { status: 403 },
    );
  }

  const authResult = auth(req, ModelProvider.DeepSeek);
  if (authResult.error) {
    return NextResponse.json(authResult, {
      status: 401,
    });
  }

  try {
    const response = await request(req);
    return response;
  } catch (e) {
    console.error("[DeepSeek] ", e);
    return NextResponse.json(prettyObject(e));
  }
}

// Parsed as auth() parses it, so a header auth() takes for an access code
// (and answers with the server key) never counts as the user's own key here
function hasUserApiKey(req: NextRequest) {
  return !!parseApiKey(req.headers.get("Authorization") ?? "").apiKey;
}

async function request(req: NextRequest) {
  const controller = new AbortController();

  // alibaba use base url or just remove the path
  let path = `${req.nextUrl.pathname}`.replaceAll(ApiPath.DeepSeek, "");

  let baseUrl = serverConfig.deepseekUrl || DEEPSEEK_BASE_URL;

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
    10 * 60 * 1000,
  );

  const fetchUrl = joinDeepSeekUrl(baseUrl, path);
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

  // The client asks for stream usage assuming this proxy forwards to the
  // official host; drop it when DEEPSEEK_URL points somewhere else.
  const stripStreamOptions = !shouldRequestStreamUsage(
    ServiceProvider.DeepSeek,
    baseUrl,
  );

  // #1815 try to refuse some request to some models
  if ((serverConfig.customModels || stripStreamOptions) && req.body) {
    try {
      const clonedBody = await req.text();
      fetchOptions.body = clonedBody;

      const jsonBody = JSON.parse(clonedBody) as {
        model?: string;
        stream_options?: unknown;
      };

      if (stripStreamOptions && jsonBody?.stream_options !== undefined) {
        delete jsonBody.stream_options;
        fetchOptions.body = JSON.stringify(jsonBody);
      }

      // not undefined and is false; Search requests carry no model
      if (
        serverConfig.customModels &&
        jsonBody?.model &&
        isModelNotavailableInServer(
          serverConfig.customModels,
          jsonBody.model,
          ServiceProvider.DeepSeek as string,
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
      console.error(`[DeepSeek] filter`, e);
    }
  }
  try {
    const res = await fetch(fetchUrl, fetchOptions);

    // to prevent browser prompt for credentials
    const newHeaders = new Headers(res.headers);
    newHeaders.delete("www-authenticate");
    // to disable nginx buffering
    newHeaders.set("X-Accel-Buffering", "no");

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: newHeaders,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
