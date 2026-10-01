import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./SEOHead";

describe("safeJsonLd", () => {
  it("</script> enjeksiyonunu etkisizleştirir ve geçerli JSON üretir", () => {
    const out = safeJsonLd({ name: "Market</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out).name).toBe("Market</script><script>alert(1)</script>");
  });
});
