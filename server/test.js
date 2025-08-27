// 테스트 스크립트 - Firebase FCM 없이 기본 기능 테스트

const { 
    getWeatherData, 
    sendPushNotification,
    checkWeatherChanges,
    sendMorningBriefing,
    sendEveningPrep 
} = require('./index.js');

console.log('🧪 개인 비서 시스템 테스트 시작\n');

async function runTests() {
    console.log('1️⃣ 날씨 데이터 가져오기 테스트');
    console.log('=' .repeat(50));
    
    try {
        const weatherData = await getWeatherData();
        if (weatherData) {
            console.log('✅ 날씨 데이터 성공:');
            console.log(`   온도: ${weatherData.temperature}`);
            console.log(`   강수확률: ${weatherData.rainProbability}`);
            console.log(`   비 예보: ${weatherData.hasRain ? '있음' : '없음'}`);
            console.log(`   시간: ${weatherData.timestamp}`);
        } else {
            console.log('❌ 날씨 데이터 실패');
        }
    } catch (error) {
        console.log('❌ 날씨 API 오류:', error.message);
    }
    
    console.log('\n2️⃣ 푸시 알림 테스트 (시뮬레이션)');
    console.log('=' .repeat(50));
    
    await sendPushNotification(
        '🧪 테스트 알림', 
        '이것은 테스트 메시지입니다.\n시스템이 정상 작동합니다!',
        { type: 'test' }
    );
    
    console.log('\n3️⃣ 아침 브리핑 테스트');
    console.log('=' .repeat(50));
    
    try {
        await sendMorningBriefing();
        console.log('✅ 아침 브리핑 테스트 완료');
    } catch (error) {
        console.log('❌ 아침 브리핑 오류:', error.message);
    }
    
    console.log('\n4️⃣ 저녁 준비 알림 테스트'); 
    console.log('=' .repeat(50));
    
    try {
        await sendEveningPrep();
        console.log('✅ 저녁 준비 알림 테스트 완료');
    } catch (error) {
        console.log('❌ 저녁 준비 알림 오류:', error.message);
    }
    
    console.log('\n5️⃣ 날씨 변화 감지 테스트');
    console.log('=' .repeat(50));
    
    try {
        await checkWeatherChanges();
        console.log('✅ 날씨 변화 감지 테스트 완료');
        
        // 5초 후 다시 체크해서 변화 감지 로직 테스트
        console.log('⏳ 5초 후 재체크...');
        setTimeout(async () => {
            await checkWeatherChanges();
            console.log('✅ 날씨 변화 재체크 완료');
        }, 5000);
        
    } catch (error) {
        console.log('❌ 날씨 변화 감지 오류:', error.message);
    }
    
    console.log('\n🎯 환경 정보');
    console.log('=' .repeat(50));
    console.log(`Node.js 버전: ${process.version}`);
    console.log(`현재 시간: ${new Date().toLocaleString('ko-KR')}`);
    console.log(`FCM 토큰 설정: ${process.env.FCM_TOKEN ? '✅ 있음' : '❌ 없음'}`);
    console.log(`Firebase 설정: ${process.env.FIREBASE_SERVICE_ACCOUNT ? '✅ 있음' : '❌ 없음'}`);
    
    console.log('\n📋 테스트 완료 요약');
    console.log('=' .repeat(50));
    console.log('💡 Firebase FCM이 설정되지 않은 경우 "시뮬레이션" 메시지가 표시됩니다.');
    console.log('💡 실제 운영 환경에서는 .env 파일에 실제 FCM 토큰을 설정하세요.');
    console.log('💡 GitHub Actions에서 자동 실행 시 GITHUB_SECRETS 값이 사용됩니다.');
}

// 테스트 실행
runTests().catch(console.error);