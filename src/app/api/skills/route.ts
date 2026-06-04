import { NextResponse } from "next/server";
import { fetchSkillsData } from "@/lib/skills/fetch";

export async function GET() {
  try {
    const data = await fetchSkillsData();
    if (!data) {
      return NextResponse.json(
        { error: "Failed to fetch latest data" },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
