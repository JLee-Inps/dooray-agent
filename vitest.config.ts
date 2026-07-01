import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 모든 테스트 파일 import 전에 HOME 을 임시 디렉터리로 돌려
    // config/cache 파일 부작용이 실제 홈에 닿지 않게 한다.
    setupFiles: ["./src/test-setup.ts"],
  },
});
