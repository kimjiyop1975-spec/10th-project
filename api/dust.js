// Vercel 서버리스 함수: 한국환경공단 에어코리아 대기오염정보 중계 API 핸들러
export default async function handler(req, res) {
  // CORS 및 기본 JSON 응답 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // 요청 쿼리에서 sido 파라미터를 가져오며, 없을 경우 기본값 '서울' 지정
  const sido = req.query.sido || '서울';

  // 환경변수에서 Decoding 인증키 가져오기
  const serviceKey = process.env.AIRKOREA_KEY;

  // 서버 환경변수에 인증키가 설정되지 않은 경우 에러 반환
  if (!serviceKey) {
    return res.status(500).json({
      error: '서버 환경변수(AIRKOREA_KEY)가 설정되지 않았습니다. Vercel 또는 .env.local 설정을 확인해주세요.'
    });
  }

  // Decoding 키를 URL 쿼리 파라미터 규격에 맞게 인코딩 처리
  const encodedKey = encodeURIComponent(serviceKey);

  // 에어코리아 시도별 실시간 측정정보 조회 API URL 조합 (요청 파라미터 포함)
  const apiUrl = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty?serviceKey=${encodedKey}&returnType=json&sidoName=${encodeURIComponent(sido)}&numOfRows=100&pageNo=1&ver=1.3`;

  try {
    // 공공데이터포털 API 호출
    const response = await fetch(apiUrl);
    const rawText = await response.text();

    // 응답이 XML(에러 메시지 등) 형태로 시작하는지 확인
    if (rawText.trim().startsWith('<')) {
      return res.status(500).json({
        error: '인증키 또는 요청값을 확인해주세요.',
        details: rawText
      });
    }

    // JSON 텍스트 파싱 시도
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(500).json({
        error: '응답 데이터를 파싱할 수 없습니다. 인증키 또는 요청값을 확인해주세요.'
      });
    }

    // resultCode 및 결과 데이터 구조 점검 (공공데이터포털 성공 코드는 '00')
    const resultCode = data?.response?.header?.resultCode;
    const resultMsg = data?.response?.header?.resultMsg;

    if (resultCode && resultCode !== '00') {
      return res.status(500).json({
        error: `공공데이터포털 요청 실패: [코드 ${resultCode}] ${resultMsg || '알 수 없는 오류'}`,
        raw: data
      });
    }

    // 측정 데이터 항목(items)이 정상적으로 존재하는지 확인 후 반환
    return res.status(200).json(data);
  } catch (err) {
    // 네트워크 및 서버 내부 예외 처리
    return res.status(500).json({
      error: '에어코리아 API 서버와의 통신 중 오류가 발생했습니다.',
      details: err.message
    });
  }
}

