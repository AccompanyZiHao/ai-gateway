import { redirect } from 'next/navigation';

// 博客独立部署在 blog.haol.top，这里直接跳转
export default function BlogPage() {
  redirect('https://blog.haol.top');
}
