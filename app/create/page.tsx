"use client";

    import { useState } from "react";
    import { useRouter } from "next/navigation";
    // Fallback 컴포넌트들을 import 합니다.
    import FallbackCreatePromiseForm from "@/components/fallback/FallbackCreatePromiseForm";
    import FallbackUserLogin from "@/components/fallback/FallbackUserLogin";
    import { Button } from "@/components/ui/button";
    import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
    import Link from "next/link";
    import { useUser } from "@/lib/user-context"; // 경로 확인 필요

    // --- Firebase Firestore 가져오기 ---
    import { db } from "../../lib/firebase"; // 경로 확인 필요
    import { collection, addDoc, serverTimestamp } from "firebase/firestore";

    // --- ---

    export default function CreatePage() {
      const router = useRouter();
      const { currentUser } = useUser();
      const [isSubmitting, setIsSubmitting] = useState(false); // 로딩 상태
      const [error, setError] = useState<string | null>(null); // 오류 메시지 상태

      // Fallback 컴포넌트를 사용합니다.
      const UserLoginComponent = FallbackUserLogin;
      const CreatePromiseFormComponent = FallbackCreatePromiseForm;

      if (!currentUser) {
        return <UserLoginComponent />;
      }

      // Firestore에 데이터 저장하는 함수
      const handleCreatePromise = async (promiseData: {
        title: string;
        date: string;
        time: string;
        location: string;
        penalty: string;
        password: string;
      }) => {
        if (!db) {
            setError("Firestore 데이터베이스에 연결할 수 없습니다. lib/firebase.ts 파일을 확인하세요.");
            console.error("Firestore db object is null. Check firebase initialization.");
            return;
        }
        if (!currentUser) {
            setError("로그인이 필요합니다.");
            return;
        }

        setIsSubmitting(true); // 로딩 시작
        setError(null);

        try {
          // Firestore 'promises' 컬렉션에 새 문서 추가
          const docRef = await addDoc(collection(db, "promises"), {
            // 전달받은 promiseData 필드들
            title: promiseData.title,
            date: promiseData.date,
            time: promiseData.time,
            location: promiseData.location,
            penalty: promiseData.penalty,
            password: promiseData.password, // 비밀번호 저장 (보안 고려 필요)
            // 추가 정보
            creator: currentUser,
            participants: [currentUser], // 생성자를 첫 참여자로 자동 추가
            createdAt: serverTimestamp(), // ✅ 서버 기준 생성 시간

          });

          console.log("Document written with ID: ", docRef.id);
          // 성공 시 생성된 약속의 상세 페이지로 이동
          router.push(`/promise/${docRef.id}`);

        } catch (e) {
          console.error("Error adding document: ", e);
          setError("약속을 저장하는 중 오류가 발생했습니다.");
          setIsSubmitting(false); // 오류 시 로딩 종료
        }
      };

      return (
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            {/* 뒤로가기 버튼 */}
            <Link href="/" passHref>
              <Button variant="ghost" className="mb-6" disabled={isSubmitting}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                대시보드로 돌아가기
              </Button>
            </Link>

            {/* 페이지 제목 */}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Calendar className="w-10 h-10 text-primary" />
                <h1 className="text-3xl font-bold">새로운 약속 만들기</h1>
              </div>
              <p className="text-muted-foreground">친구들과 함께할 약속을 생성하세요</p>
            </div>

            {/* 약속 생성 폼 (Fallback 사용) */}
            <CreatePromiseFormComponent onCreate={handleCreatePromise} currentUser={currentUser} />

            {/* 로딩 표시 */}
            {isSubmitting && (
              <div className="mt-4 flex items-center justify-center text-primary">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span>약속을 저장하는 중...</span>
              </div>
            )}

            {/* 오류 메시지 표시 */}
            {error && (
              <div className="mt-4 p-4 bg-destructive/10 text-destructive border border-destructive/30 rounded-md text-center">
                {error}
              </div>
            )}
          </div>
        </div>
      );
    }
    
