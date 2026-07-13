import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentType
} from "react";
import { dialog } from "@/utils/ui/feedback";
import { getKeyName } from "./key";
import VirtualKeyboard from "./VirtualKeyboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@/components/ui/hover-card";
import { CircleHelp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

/** Reactive field handle. Replaces Vue's MaybeRef pattern. */
export interface Field<T = any> {
  get: () => T;
  set: (v: T) => void;
}

/** Helper for binding to an object key with immutable replace. */
export function field<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  onReplace: (next: T) => void
): Field<T[K]> {
  return {
    get: () => obj[key],
    set: v => onReplace({ ...obj, [key]: v })
  };
}

export interface SelectSchema {
  type: "select";
  options: { value: any; label: string }[];
}
export interface InputSchema {
  type: "input";
}
export interface SwitchSchema {
  type: "switch";
}
export interface SliderSchema {
  type: "slider";
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
}
export interface NumberSchema {
  type: "number";
}
export interface NumberPairSchema {
  type: "number-pair";
  field2: Field;
}
export interface ButtonSchema {
  type: "button";
  onClick?: () => void;
}
export interface KeySchema {
  type: "key";
}
export interface TableSchema {
  type: "table";
  data?: any[];
  columns?: { key: string; title: string; render?: (row: any) => ReactNode }[];
}
export type Schema =
  | SelectSchema
  | InputSchema
  | SwitchSchema
  | SliderSchema
  | NumberSchema
  | NumberPairSchema
  | ButtonSchema
  | KeySchema
  | TableSchema;

export interface SchemaItem {
  label: string;
  field?: Field;
  tip?: string;
}

const findOptionLabel = (
  options: { value: any; label: string }[],
  v: any
): string | undefined => options.find(o => o.value === v)?.label;

const openKeyChanger = (label: string, f: Field<number>) => {
  dialog.create({
    title: label,
    content: () =>
      // content renders as ReactNode via dialog-store; closure reads latest value on render
      (() => {
        // Note: this functional content is re-rendered by GlobalDialogHost on each render of the host;
        // value is captured fresh from f.get() at each render, so the keyboard stays in sync.
        return (
          <VirtualKeyboard
            t={k => k}
            value={f.get()}
            onChange={v => {
              f.set(v);
              dialog.destroyAll();
            }}
          />
        );
      })()
  });
};

interface NFormWrapperProps {
  schema: (Schema & SchemaItem)[];
}

export default function NFormWrapper({ schema }: NFormWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [labelWidth, setLabelWidth] = useState(220);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setLabelWidth(Math.max(140, Math.min(360, w * 0.35)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-full">
      <div className="h-full overflow-auto">
        <div className="flex flex-col">
          {schema.map((x, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 border-b py-3 last:border-b-0 md:flex-row md:items-center"
            >
              {/* Label column */}
              <div
                className="shrink-0 md:pr-4"
                style={{ width: `${labelWidth}px` }}
              >
                <div className="flex items-center gap-1">
                  <Label className="text-sm font-medium">{x.label}</Label>
                  {x.tip && (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 transition-colors hover:text-foreground"
                          tabIndex={-1}
                        >
                          <CircleHelp className="size-3.5" />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        side="top"
                        className="w-72 text-xs leading-relaxed"
                      >
                        {x.tip}
                      </HoverCardContent>
                    </HoverCard>
                  )}
                </div>
              </div>

              {/* Control column */}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {x.type === "select" && x.field && (
                  <Select
                    value={String(x.field.get())}
                    onValueChange={v => {
                      const orig = x.field!.get();
                      const cast = typeof orig === "number" ? Number(v) : v;
                      x.field!.set(cast);
                    }}
                  >
                    <SelectTrigger className="w-full md:w-[240px]">
                      <SelectValue
                        placeholder={
                          findOptionLabel(x.options, x.field.get()) ?? ""
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {x.options.map(opt => (
                        <SelectItem key={opt.value} value={String(opt.value)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {x.type === "input" && x.field && (
                  <Input
                    value={x.field.get() ?? ""}
                    onChange={e => x.field!.set(e.target.value as any)}
                  />
                )}

                {x.type === "switch" && x.field && (
                  <Switch
                    checked={!!x.field.get()}
                    onCheckedChange={v => x.field!.set(v as any)}
                  />
                )}

                {x.type === "slider" && x.field && (
                  <div className="flex w-full max-w-[280px] items-center gap-3">
                    <Slider
                      value={[Number(x.field.get())]}
                      min={x.min ?? 0}
                      max={x.max ?? 100}
                      step={x.step ?? 1}
                      className="flex-1"
                      onValueChange={(arr: number[]) =>
                        x.field!.set(arr[0] as any)
                      }
                    />
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums">
                      {x.format
                        ? x.format(Number(x.field.get()))
                        : String(x.field.get())}
                    </span>
                  </div>
                )}

                {x.type === "number" && x.field && (
                  <Input
                    type="number"
                    value={x.field.get() ?? 0}
                    onChange={e => x.field!.set(Number(e.target.value) as any)}
                  />
                )}

                {x.type === "number-pair" && x.field && (
                  <>
                    <Input
                      type="number"
                      className="w-24"
                      value={x.field.get() ?? 0}
                      onChange={e =>
                        x.field!.set(Number(e.target.value) as any)
                      }
                    />
                    <span className="text-muted-foreground">×</span>
                    <Input
                      type="number"
                      className="w-24"
                      value={x.field2.get() ?? 0}
                      onChange={e =>
                        x.field2!.set(Number(e.target.value) as any)
                      }
                    />
                  </>
                )}

                {x.type === "button" && (
                  <Button variant="outline" size="sm" onClick={x.onClick}>
                    {x.label}
                  </Button>
                )}

                {x.type === "key" && x.field && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openKeyChanger(x.label, x.field! as Field<number>)
                    }
                  >
                    {getKeyName(x.field.get())}
                  </Button>
                )}

                {x.type === "table" && (
                  <div className="w-full">
                    <Table>
                      {x.columns && x.columns.length > 0 && (
                        <TableHeader>
                          <TableRow>
                            {x.columns.map(col => (
                              <TableHead key={col.key} className="text-xs">
                                {col.title}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                      )}
                      {x.data && x.columns && (
                        <TableBody>
                          {x.data.map((row, ridx) => (
                            <TableRow key={ridx}>
                              {x.columns!.map(col => (
                                <TableCell key={col.key} className="text-xs">
                                  {col.render ? col.render(row) : row[col.key]}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      )}
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// helper export for callers that want the icon type
export type { ComponentType };
