import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cosmic Sandbox — 交互式宇宙沙盘模拟器",
  description: "牛顿引力 · 碰撞合并 · 时空扭曲的赛博朋克宇宙模拟器",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="bg-black">{children}</body>
    </html>
  );
}
