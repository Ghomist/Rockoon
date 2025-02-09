export const keySchema: KeySchema[][] = [
  [
    { id: 38, name: "`" },
    { id: 0, name: "1" },
    { id: 1, name: "2" },
    { id: 2, name: "3" },
    { id: 3, name: "4" },
    { id: 4, name: "5" },
    { id: 5, name: "6" },
    { id: 6, name: "7" },
    { id: 7, name: "8" },
    { id: 8, name: "9" },
    { id: 9, name: "0" },
    { id: 10, name: "-" },
    { id: 11, name: "=" },
    { id: 12, name: "BackSpace", display: "BKSP", width: 3 },
    { id: -1, name: "N", disabled: true },
    { id: 61, name: "Num +", display: "+" },
    { id: 57, name: "Num -", display: "-" }
  ],
  [
    { id: 13, name: "Tab", width: 1.5 },
    { id: 14, name: "Q" },
    { id: 15, name: "W" },
    { id: 16, name: "E" },
    { id: 17, name: "R" },
    { id: 18, name: "T" },
    { id: 19, name: "Y" },
    { id: 20, name: "U" },
    { id: 21, name: "I" },
    { id: 22, name: "O" },
    { id: 23, name: "P" },
    { id: 24, name: "[" },
    { id: 25, name: "]" },
    { id: 40, name: "\\" },
    { id: 66, name: "Num Del", display: "Del", width: 1.5 },
    { id: 54, name: "Num 7", display: "7" },
    { id: 55, name: "Num 8", display: "8" },
    { id: 56, name: "Num 9", display: "9" }
  ],
  [
    { id: -1, name: "Caps", width: 2, disabled: true },
    { id: 27, name: "A" },
    { id: 28, name: "S" },
    { id: 29, name: "D" },
    { id: 30, name: "F" },
    { id: 31, name: "G" },
    { id: 32, name: "H" },
    { id: 33, name: "J" },
    { id: 34, name: "K" },
    { id: 35, name: "L" },
    { id: 36, name: ";" },
    { id: 37, name: "'" },
    { id: -1, name: "Enter", width: 3 },
    { id: 58, name: "Num 4", display: "4" },
    { id: 59, name: "Num 5", display: "5" },
    { id: 60, name: "Num 6", display: "6" }
  ],
  [
    { id: 39, name: "Shift", width: 2.5 },
    { id: 41, name: "Z" },
    { id: 42, name: "X" },
    { id: 43, name: "C" },
    { id: 44, name: "V" },
    { id: 45, name: "B" },
    { id: 46, name: "N" },
    { id: 47, name: "M" },
    { id: 48, name: "," },
    { id: 49, name: "." },
    { id: 50, name: "/" },
    { id: 51, name: "Right Shift", display: "R-Shift", width: 2.5 },
    { id: 68, name: "Up", display: "↑" },
    { id: 62, name: "Num 1", display: "1" },
    { id: 63, name: "Num 2", display: "2" },
    { id: 64, name: "Num 3", display: "3" }
  ],
  [
    { id: 26, name: "Ctrl", width: 1.5 },
    { id: 52, name: "Alt", width: 1.5 },
    { id: 53, name: "Space", width: 11 },
    { id: 70, name: "Left", display: "←" },
    { id: 69, name: "Down", display: "↓" },
    { id: 71, name: "Right", display: "→" },
    { id: 65, name: "Num 0", display: "0", width: 2 }
  ]
];

const flatKeySchema = keySchema.flat(1);

export const getKeyName = (index: number) => {
  const key = flatKeySchema.find(x => x.id === index);
  return key?.display ?? key?.name;
};

export const getKeyByPhysicCode = (code: string) => {
  const name = (() => {
    if (/BackQuote/gi.test(code)) return "`";
    if (/Minus/gi.test(code)) return "-";
    if (/Equal/gi.test(code)) return "=";
    if (/NumpadSubtract/gi.test(code)) return "Num -";
    if (/NumpadAdd/gi.test(code)) return "Num +";
    if (/Delete/gi.test(code)) return "Num Del";
    if (/ShiftRight/gi.test(code)) return "Right Shift";
    if (/ShiftLeft/gi.test(code)) return "Shift";
    if (/ControlLeft/gi.test(code)) return "Ctrl";
    if (/AltLeft/gi.test(code)) return "Alt";
    if (/BackSpace/gi.test(code)) return "BackSpace";

    if (/BracketLeft/gi.test(code)) return "[";
    if (/BracketRight/gi.test(code)) return "]";
    if (/Comma/gi.test(code)) return ",";
    if (/Period/gi.test(code)) return ".";
    if (/Semicolon/gi.test(code)) return ";";
    if (/Quote/gi.test(code)) return "'";
    if (/Backslash/gi.test(code)) return "\\";
    if (/Slash/gi.test(code)) return "/";

    if (code.startsWith("Key")) return code.replace("Key", "");
    if (code.startsWith("Arrow")) return code.replace("Arrow", "");
    if (code.startsWith("Digit")) return code.replace("Digit", "");
    if (code.startsWith("Numpad")) return code.replace("Numpad", "Num ");

    return code;
  })();
  return flatKeySchema.find(x => x.name === name)?.id;
};
