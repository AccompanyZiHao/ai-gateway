import Link from 'next/link';

export default function BlogPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-6 text-center">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          &larr; 返回合集
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Blog
        </h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">
          博客（待开发）
        </p>
      </main>
    </div>
  );
}
