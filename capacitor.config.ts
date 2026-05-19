import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cn.wenrugou.imagestudio",
  appName: "稳如狗生图工作台V1.0",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
