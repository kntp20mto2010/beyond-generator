import type { PathCmd } from "../../core/schema/geometry.js";

export function pathCmdsToD(cmds: readonly PathCmd[]): string {
  return cmds
    .map((cmd) => {
      switch (cmd.c) {
        case "M": return `M ${cmd.p[0]} ${cmd.p[1]}`;
        case "L": return `L ${cmd.p[0]} ${cmd.p[1]}`;
        case "Q": return `Q ${cmd.cp[0]} ${cmd.cp[1]} ${cmd.p[0]} ${cmd.p[1]}`;
        case "C": return `C ${cmd.cp1[0]} ${cmd.cp1[1]} ${cmd.cp2[0]} ${cmd.cp2[1]} ${cmd.p[0]} ${cmd.p[1]}`;
        case "Z": return "Z";
      }
    })
    .join(" ");
}
