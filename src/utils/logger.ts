import backend, { type LogLevel } from "@/backend";

export const registerLoggers = () => {
  // hook console functions
  hookConsoleFunction("error", "error", console.error);
  hookConsoleFunction("info", "info", console.info);
  hookConsoleFunction("info", "log", console.log);
  hookConsoleFunction("warn", "warn", console.warn);
  hookConsoleFunction("debug", "debug", console.debug);
  hookConsoleFunction("trace", "trace", console.trace);

  window.addEventListener("unhandledrejection", event => {
    console.error(event.reason);
  });
};

const hookConsoleFunction = (
  level: LogLevel,
  funcName: keyof typeof console,
  func: (...args: any[]) => void
) => {
  console[funcName] = (function (oriLogFunc) {
    return function () {
      oriLogFunc.call(console, ...arguments);
      backend.log(
        level,
        [...arguments]
          .map(arg =>
            arg instanceof Error
              ? arg.stack
              : typeof arg === "object"
                ? JSON.stringify(arg, null, 2)
                : arg
          )
          .join(", ")
      );
    };
  })(func) as any;
};
