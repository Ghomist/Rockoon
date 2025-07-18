import app from "@/api/app";
import type { LogLevel } from "@/api/app";

export const registerLoggers = () => {
  // hook console functions
  hookConsoleFunction("error", console.error);
  hookConsoleFunction("info", console.info);
  hookConsoleFunction("info", console.log);
  hookConsoleFunction("warn", console.warn);
  hookConsoleFunction("debug", console.debug);
  hookConsoleFunction("trace", console.trace);

  window.addEventListener("unhandledrejection", event => {
    console.error(event.reason);
  });
};

const hookConsoleFunction = (level: LogLevel, func: Function) => {
  (console as any)[level] = (function (oriLogFunc) {
    return function () {
      oriLogFunc.call(console, ...arguments);
      app.log(level, [...arguments].map(String).join(", "));
    };
  })(func);
};
