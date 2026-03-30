const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const apiClient = {
  // 🌟 GETリクエスト用（データ取得）
  get: async (endpoint: string) => {
    const res = await fetch(`${BASE_URL}${endpoint}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  
  // 🌟 POSTリクエスト用（JSONデータの送信）
  post: async (endpoint: string, body: any) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },

  // 🌟 画像やファイルのアップロード用（FormDataの送信）
  postForm: async (endpoint: string, formData: FormData) => {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      // FormDataを送る時は、システムが自動でContent-Typeを設定してくれるからヘッダーは不要
      body: formData, 
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  }
};