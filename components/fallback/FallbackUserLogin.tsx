'use client';

import { useState } from 'react';
import { useUser } from '@/lib/user-context';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function FallbackUserLogin() {
  const { setCurrentUser } = useUser();
  const [name, setName] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="닉네임 또는 ID를 입력하세요"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={() => {
              if (!name.trim()) return;
              setCurrentUser(name.trim());
              window.location.href = '/';
            }}
          >
            로그인
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
