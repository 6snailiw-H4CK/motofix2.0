import fs from "node:fs/promises";

export const parseJsonRejectDuplicateKeys = (source: string): unknown => {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
  };
  const parseString = () => {
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === "\\") {
        index += 2;
        continue;
      }
      if (character === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      }
      index += 1;
    }
    throw new Error("invalid_json");
  };
  const parseValue = (): void => {
    skipWhitespace();
    const character = source[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      const keys = new Set<string>();
      while (index < source.length) {
        skipWhitespace();
        if (source[index] !== '"') throw new Error("invalid_json");
        const key = parseString();
        if (keys.has(key)) throw new Error("duplicate_json_key");
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") throw new Error("invalid_json");
        index += 1;
        parseValue();
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("invalid_json");
        index += 1;
      }
      throw new Error("invalid_json");
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error("invalid_json");
        index += 1;
      }
      throw new Error("invalid_json");
    }
    if (character === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < source.length && !/[\s,[\]{}:]/.test(source[index])) index += 1;
    if (start === index) throw new Error("invalid_json");
    JSON.parse(source.slice(start, index));
  };

  parseValue();
  skipWhitespace();
  if (index !== source.length) throw new Error("invalid_json");
  return JSON.parse(source);
};

export const createNewReportFile = (filePath: string) => fs.writeFile(
  filePath,
  "",
  { encoding: "utf8", flag: "wx" },
);
