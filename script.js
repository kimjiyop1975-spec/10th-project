// Vercel 서버리스 내부 엔드포인트 URL
const INTERNAL_API_URL = '/api/dust';

// HTML DOM 요소 참조 가져오기
const sidoSelect = document.getElementById('sidoSelect');
const trafficCard = document.getElementById('trafficCard');
const trafficRegion = document.getElementById('trafficRegion');
const trafficEmoji = document.getElementById('trafficEmoji');
const trafficStatus = document.getElementById('trafficStatus');
const trafficValue = document.getElementById('trafficValue');
const trafficAdvice = document.getElementById('trafficAdvice');
const trafficTime = document.getElementById('trafficTime');
const chartSection = document.getElementById('chartSection');
const stationGrid = document.getElementById('stationGrid');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');

// Chart.js 인스턴스 전역 변수
let pm10ChartInstance = null;

// 미세먼지 등급 번호에 따른 신호등 이모지, 텍스트, 클래스 및 권고 문구, 색상 매핑 함수
function getGradeInfo(grade) {
  switch (String(grade)) {
    case '1':
      return {
        emoji: '🔵',
        text: '좋음',
        className: 'grade-1',
        advice: '공기가 깨끗해요! 환기하기 좋은 날입니다.',
        barColor: '#3b82f6',
        borderColor: '#2563eb'
      };
    case '2':
      return {
        emoji: '🟢',
        text: '보통',
        className: 'grade-2',
        advice: '무난한 공기질입니다. 일상적인 야외활동이 가능해요.',
        barColor: '#10b981',
        borderColor: '#059669'
      };
    case '3':
      return {
        emoji: '🟠',
        text: '나쁨',
        className: 'grade-3',
        advice: '외출 시 마스크를 챙기세요!',
        barColor: '#f97316',
        borderColor: '#ea580c'
      };
    case '4':
      return {
        emoji: '🔴',
        text: '매우나쁨',
        className: 'grade-4',
        advice: '외출 시 마스크를 챙기세요! 야외활동을 자제하세요.',
        barColor: '#ef4444',
        borderColor: '#dc2626'
      };
    default:
      return {
        emoji: '⚪',
        text: '정보 없음',
        className: 'grade-none',
        advice: '대기질 측정 정보를 집계 중입니다.',
        barColor: '#94a3b8',
        borderColor: '#64748b'
      };
  }
}

// 평균 미세먼지 수치에 따른 등급 판정 함수 (에어코리아 PM10 기준)
function getPm10GradeFromValue(value) {
  // 0~30 좋음, 31~80 보통, 81~150 나쁨, 151 이상 매우나쁨
  if (value <= 30) return getGradeInfo('1');
  if (value <= 80) return getGradeInfo('2');
  if (value <= 150) return getGradeInfo('3');
  return getGradeInfo('4');
}

// 측정 시각을 'YYYY년 MM월 DD일 HH시 기준' 형식의 한국어로 변환하는 함수
function formatKoreanDateTime(dateTimeStr) {
  if (!dateTimeStr) return '';
  const match = dateTimeStr.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (match) {
    const [, year, month, day, hour] = match;
    return `${year}년 ${parseInt(month, 10)}월 ${parseInt(day, 10)}일 ${parseInt(hour, 10)}시 기준`;
  }
  return `${dateTimeStr} 기준`;
}

// 측정값 유효성 검사 및 화면 표시용 포맷 함수 ("-" 처리)
function formatMeasureValue(val, unit = '㎍/㎥') {
  if (!val || val.trim() === '-' || isNaN(Number(val))) {
    return '측정 안 됨';
  }
  return `${Number(val)} ${unit}`;
}

// Vercel 서버리스 함수(/api/dust)를 통해 대기오염 데이터를 가져오는 함수
async function fetchAirQualityData(sidoName) {
  // 데이터를 불러오는 동안 '불러오는 중...' 표시 활성화
  loadingIndicator.style.display = 'flex';
  errorMessage.style.display = 'none';
  stationGrid.innerHTML = '';

  // 신호등 카드 초기 상태 '불러오는 중...' 설정
  trafficRegion.textContent = sidoName;
  trafficEmoji.textContent = '⚪';
  trafficStatus.textContent = '불러오는 중...';
  trafficValue.textContent = '-';
  trafficAdvice.textContent = '최신 공기질 데이터를 불러오는 중입니다...';
  trafficTime.textContent = '';
  trafficCard.className = 'traffic-card grade-none';

  try {
    // 내부 서버리스 API 호출 (/api/dust?sido=시도이름)
    const response = await fetch(`${INTERNAL_API_URL}?sido=${encodeURIComponent(sidoName)}`);
    const data = await response.json();

    // 에러 응답 처리
    if (!response.ok || data.error) {
      throw new Error(data.error || `서버 오류가 발생했습니다. (HTTP ${response.status})`);
    }

    if (!data.response || !data.response.body || !data.response.body.items) {
      throw new Error('측정소 데이터가 존재하지 않습니다.');
    }

    const items = data.response.body.items;

    // 화면 렌더링 호출
    renderData(sidoName, items);
  } catch (error) {
    console.error('데이터 조회 오류:', error);
    errorMessage.textContent = `${error.message}`;
    errorMessage.style.display = 'block';

    trafficStatus.textContent = '조회 실패';
    trafficAdvice.textContent = '대기오염 정보를 가져오지 못했습니다.';
    if (chartSection) chartSection.style.display = 'none';
  } finally {
    // 로딩 인디케이터 숨김
    loadingIndicator.style.display = 'none';
  }
}

// 상단 '공기 신호등' 대형 대시보드 갱신 함수
function updateTrafficLight(sidoName, items) {
  trafficRegion.textContent = `${sidoName} 공기 신호등`;

  // 유효한 PM10 측정 수치만 필터링
  const validPm10Values = items
    .map(item => item.pm10Value)
    .filter(val => val && val.trim() !== '-' && !isNaN(Number(val)))
    .map(val => Number(val));

  // 가장 최신 측정 시각 찾기
  const latestItem = items.find(item => item.dataTime && item.dataTime.trim() !== '');
  const latestTimeText = latestItem ? formatKoreanDateTime(latestItem.dataTime) : '';
  trafficTime.textContent = latestTimeText;

  // 유효 측정값이 없을 때 처리
  if (validPm10Values.length === 0) {
    trafficEmoji.textContent = '⚪';
    trafficStatus.textContent = '측정 안 됨';
    trafficValue.textContent = '-';
    trafficAdvice.textContent = '현재 해당 지역의 측정 데이터가 없습니다.';
    trafficCard.className = 'traffic-card grade-none';
    return;
  }

  // 평균 미세먼지 수치 계산
  const sum = validPm10Values.reduce((acc, cur) => acc + cur, 0);
  const avg = Math.round((sum / validPm10Values.length) * 10) / 10;

  // 평균 수치 기반 등급 정보 가져오기
  const gradeInfo = getPm10GradeFromValue(avg);

  // 이모지 + 상태 텍스트 + 평균 수치 갱신
  trafficEmoji.textContent = gradeInfo.emoji;
  trafficStatus.textContent = gradeInfo.text;
  trafficValue.textContent = `${avg} ㎍/㎥`;

  // 나쁨 이상일 경우 마스크 권고 문구 반영
  trafficAdvice.textContent = gradeInfo.advice;

  // 메인 신호등 카드 클래스 갱신 (테마 색상 변경)
  trafficCard.className = `traffic-card ${gradeInfo.className}`;
}

// Chart.js를 이용한 미세먼지 TOP 10 가로 막대그래프 렌더링 함수
function renderChart(items) {
  // '측정 안 됨'("-", 빈값, NaN) 제외 및 유효한 측정소 필터링
  const validItems = items
    .filter(item => item.pm10Value && item.pm10Value.trim() !== '-' && !isNaN(Number(item.pm10Value)))
    .map(item => ({
      stationName: item.stationName,
      pm10Value: Number(item.pm10Value),
      pm10Grade: item.pm10Grade
    }));

  // 유효 측정소가 없는 경우 차트 숨김 처리
  if (validItems.length === 0) {
    chartSection.style.display = 'none';
    return;
  }
  chartSection.style.display = 'block';

  // 수치 높은 순(내림차순)으로 정렬 후 상위 10개만 슬라이스
  const top10Items = validItems
    .sort((a, b) => b.pm10Value - a.pm10Value)
    .slice(0, 10);

  // 차트 라벨(측정소명), 데이터(미세먼지 수치), 등급별 색상 배열 생성
  const labels = top10Items.map(item => item.stationName);
  const dataValues = top10Items.map(item => item.pm10Value);
  const barColors = top10Items.map(item => getGradeInfo(item.pm10Grade).barColor);
  const borderColors = top10Items.map(item => getGradeInfo(item.pm10Grade).borderColor);

  // 캔버스 요소 가져오기
  const ctx = document.getElementById('pm10BarChart').getContext('2d');

  // 기존 차트 인스턴스가 존재하면 파괴하여 중복 방지
  if (pm10ChartInstance) {
    pm10ChartInstance.destroy();
  }

  // 가로 막대그래프(indexAxis: 'y') 생성
  pm10ChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '미세먼지 (PM10)',
        data: dataValues,
        backgroundColor: barColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        barPercentage: 0.7
      }]
    },
    options: {
      indexAxis: 'y', // 가로 막대그래프 설정
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // 단일 지표이므로 범례 숨김
        },
        tooltip: {
          backgroundColor: '#1e293b',
          titleFont: { family: 'Pretendard', size: 13, weight: 'bold' },
          bodyFont: { family: 'Pretendard', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function(context) {
              const val = context.parsed.x;
              const grade = top10Items[context.dataIndex].pm10Grade;
              const gradeText = getGradeInfo(grade).text;
              return ` 미세먼지: ${val} ㎍/㎥ (${gradeText})`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: '#f1f5f9'
          },
          ticks: {
            font: { family: 'Pretendard', size: 11, weight: '600' },
            color: '#64748b'
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: { family: 'Pretendard', size: 12, weight: '700' },
            color: '#1e293b'
          }
        }
      }
    }
  });
}

// 각 측정소별 카드 렌더링 함수 (은은한 테두리와 배경색 반영)
function renderCards(items) {
  stationGrid.innerHTML = '';

  if (items.length === 0) {
    stationGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #64748b; font-weight: 600;">측정소 정보가 없습니다.</p>';
    return;
  }

  items.forEach(item => {
    // 측정소의 pm10Grade 기반 등급 정보
    const gradeInfo = getGradeInfo(item.pm10Grade);

    const card = document.createElement('div');
    card.className = `card ${gradeInfo.className}`;

    // 한국어 포맷 측정 시각
    const timeFormatted = formatKoreanDateTime(item.dataTime);

    card.innerHTML = `
      <div class="card-header">
        <h3 class="station-name">${item.stationName || '알 수 없음'}</h3>
        <span class="grade-badge ${gradeInfo.className}">
          <span>${gradeInfo.emoji}</span>
          <span>${gradeInfo.text}</span>
        </span>
      </div>
      <div class="card-body">
        <div class="info-row">
          <span class="info-label">미세먼지 (PM10)</span>
          <span class="info-value">${formatMeasureValue(item.pm10Value)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">초미세먼지 (PM2.5)</span>
          <span class="info-value">${formatMeasureValue(item.pm25Value)}</span>
        </div>
      </div>
      <div class="card-footer">
        ${timeFormatted || '측정 시각 정보 없음'}
      </div>
    `;

    stationGrid.appendChild(card);
  });
}

// 통합 렌더링 함수
function renderData(sidoName, items) {
  updateTrafficLight(sidoName, items);
  renderChart(items);
  renderCards(items);
}

// 시도 변경 이벤트 리스너
sidoSelect.addEventListener('change', (e) => {
  fetchAirQualityData(e.target.value);
});

// 초기 로딩
window.addEventListener('DOMContentLoaded', () => {
  fetchAirQualityData(sidoSelect.value);
});
