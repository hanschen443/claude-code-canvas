import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import {
  CheckCircle,
  Loader2,
  Clock,
  XCircle,
  SkipForward,
  FileText,
  Brain,
} from "lucide-vue-next";
import RunStatusIcon from "@/components/run/RunStatusIcon.vue";
import type { RunStatus, RunPodStatus } from "@/types/run";

function mountIcon(status: RunStatus | RunPodStatus) {
  return mount(RunStatusIcon, {
    props: { status },
  });
}

describe("RunStatusIcon", () => {
  it("completed 狀態應渲染 CheckCircle", () => {
    const wrapper = mountIcon("completed");
    expect(wrapper.findComponent(CheckCircle).exists()).toBe(true);
  });

  it("running 狀態應渲染 Loader2 並帶 animate-spin", () => {
    const wrapper = mountIcon("running");
    const icon = wrapper.findComponent(Loader2);
    expect(icon.exists()).toBe(true);
    expect(icon.classes()).toContain("animate-spin");
  });

  it("pending 狀態應渲染 Clock", () => {
    const wrapper = mountIcon("pending");
    expect(wrapper.findComponent(Clock).exists()).toBe(true);
  });

  it("error 狀態應渲染 XCircle", () => {
    const wrapper = mountIcon("error");
    expect(wrapper.findComponent(XCircle).exists()).toBe(true);
  });

  it("skipped 狀態應渲染 SkipForward 並帶 text-amber-500", () => {
    const wrapper = mountIcon("skipped");
    const icon = wrapper.findComponent(SkipForward);
    expect(icon.exists()).toBe(true);
    expect(icon.classes()).toContain("text-amber-500");
  });

  it("deciding 狀態應渲染 Brain 並帶 animate-pulse", () => {
    const wrapper = mountIcon("deciding");
    const icon = wrapper.findComponent(Brain);
    expect(icon.exists()).toBe(true);
    expect(icon.classes()).toContain("animate-pulse");
  });

  it("summarizing 狀態應渲染 FileText 並帶 animate-pulse", () => {
    const wrapper = mountIcon("summarizing");
    const icon = wrapper.findComponent(FileText);
    expect(icon.exists()).toBe(true);
    expect(icon.classes()).toContain("animate-pulse");
  });
});
