"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Quiz } from "./quiz";
import { LoadingScreen } from "@/components/loading-screen";
import { getQuizData, type QuizData } from "@/lib/content/offline";

/**
 * Mobile (offline) variant of the quiz page. Reads book/chapter from the route
 * and loads questions from the bundle. <Quiz> reads the version query param
 * itself.
 */
export function OfflineQuiz() {
  const params = useParams();
  const bookName = decodeURIComponent(String(params.book));
  const chapterNum = parseInt(String(params.chapter), 10);

  const [data, setData] = useState<QuizData | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    getQuizData(bookName, chapterNum).then((d) => {
      if (active) setData(d);
    });
    return () => {
      active = false;
    };
  }, [bookName, chapterNum]);

  if (!data) return <LoadingScreen label="Loading quiz…" />;

  return (
    <Quiz
      bookName={bookName}
      chapterNumber={chapterNum}
      questions={data.questions}
      chapterNumbers={data.chapterNumbers}
    />
  );
}
