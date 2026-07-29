import { NextRequest, NextResponse } from "next/server";
import { loadQuestions, loadHeadings } from "@/lib/content/chapter-data";
import { isOfferedVersion, loadBookText } from "@/lib/content/chapter-text";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const bookName = searchParams.get("book") ?? "John";
  const chapterNum = parseInt(searchParams.get("chapter") ?? "1", 10);
  const versionAbbr = searchParams.get("version") ?? "BSB";

  if (isNaN(chapterNum)) {
    return NextResponse.json({ error: "Invalid chapter" }, { status: 400 });
  }

  if (!isOfferedVersion(versionAbbr)) {
    return NextResponse.json({ error: "Translation not found" }, { status: 404 });
  }

  const bookText = loadBookText(versionAbbr, bookName);
  if (!bookText) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const text = bookText.chapters.get(chapterNum);
  if (text === undefined) {
    return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
  }

  return NextResponse.json({
    text,
    questions: loadQuestions(bookName, chapterNum),
    headings: loadHeadings(bookName, chapterNum, versionAbbr),
  });
}
