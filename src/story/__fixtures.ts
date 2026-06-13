import type { Story } from "./schema.js";

// spec/12 §6「学校の日常」教室シーン(scenes[2] 相当)を単一シーン Story で
export const classroomStory: Story = {
  format: "byond-story/1",
  title: "学校の日常 第1話",
  defaults: {
    charPerSec: 7.0,
    gapSec: 0.25,
    balloonShape: "round",
    scale: 0.9,
    groundY: 700,
  },
  audioDurations: {},
  scenes: [
    {
      bg: "assets/backgrounds/bg-classroom-001.svg",
      transition: "cut", // 単一シーンなので transition は無視される
      hold: 0.5,
      cast: [
        { id: "haru", ref: "builtin:template-a", at: "centerLeft", mood: "neutral" },
        { id: "hana", ref: "builtin:template-b", at: "centerRight", face: "left", mood: "smile" },
      ],
      shots: [
        { who: "hana", line: "今日、体育あるよね?", silent: false, speed: 1 },
        { who: "haru", line: "うん、ドッジボールだって!", clip: "talk2", emotion: "smile", silent: false, speed: 1 },
        { who: "hana", emotion: "surprised", silent: false, speed: 1 },
      ],
    },
  ],
};

// 移動 + 発話を別ショットで繋ぐ採時検証用
export const walkThenTalkStory: Story = {
  format: "byond-story/1",
  title: "歩いて話す",
  defaults: {
    charPerSec: 7.0,
    gapSec: 0.25,
    balloonShape: "round",
    scale: 0.9,
    groundY: 700,
  },
  audioDurations: {},
  scenes: [
    {
      bg: "#88ccee",
      transition: "cut",
      hold: 0.5,
      cast: [{ id: "p", ref: "builtin:template-a", at: "left", mood: "neutral" }],
      shots: [
        { who: "p", walkTo: "right", silent: false, speed: 1 },
        { who: "p", line: "ついた!", after: "prev", silent: false, speed: 1 },
      ],
    },
  ],
};
