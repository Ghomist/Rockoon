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

  // 未捕获的同步异常（包括 React 渲染时抛的：它会再抛一次到这里）。不挂这个的话日志里只剩
  // React 那句「The above error occurred in <X>」，真正的错误信息丢了
  window.addEventListener("error", event => {
    console.error(event.error ?? event.message);
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
