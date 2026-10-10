import type { Metadata, Viewport } from 'next';
import './globals.css';
import './experience.css';
import { Inter, Source_Code_Pro } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], variable: '--font-source-code-pro' });

export const metadata: Metadata = {
  title: 'SEKHEM — AI Engineering Workspace',
  description: 'AI for real engineering work. Understand your project, inspect evidence, and review a considered plan.',
};

export const viewport: Viewport = {
  themeColor: '#060b0e',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark bg-background" suppressHydrationWarning>
      <body className={`font-sans antialiased ${inter.variable} ${sourceCodePro.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
