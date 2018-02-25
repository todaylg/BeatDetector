window.AudioContext = window.AudioContext || window.webkitAudioContext;
window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext

function BeatDetector(audio, analysisFin, onBeat, onBigBeat) {
	if (!audio) return;
	audio.oncanplaythrough = () => {
		init(audio, analysisFin, onBeat, onBigBeat);
	}
}

function init(audio, analysisFin, onBeat, onBigBeat) {
	//参数验证
	analysisFin = analysisFin || function () { };
	onBeat = onBeat || function () { };
	onBigBeat = onBigBeat || function () { };

	let bigBeatArr = [],
		audioLength = audio.duration,
		musicSrc = audio.getAttribute('src');

	//OnLine/OffLine audioCtx
	let audioCtx = new AudioContext();
	let offlineCtx = new OfflineAudioContext(2, audioLength * 44100, 44100);//numOfChannels,length,sampleRate

	//OnLine Analysis
	let analyser = audioCtx.createAnalyser();//TODO Analyser的参数应可定制,先默认吧
	let source = audioCtx.createMediaElementSource(audio);//Ctx接管AudioEle
	source.connect(analyser);
	analyser.connect(audioCtx.destination);

	let offLineObj = {};//传递值引用
	offLineObj.prevTime = 0;
	offLineObj.MAX_COLLECT_SIZE = 43 * (analyser.fftSize / 2);//44032 1s(44100/1024=43次fft,也就是43个levels更新)

	//防止重复触发
	let oldNow = 0;
	
	let bpmTable = [];//Todo ？？？
	let levels = new Uint8Array(analyser.frequencyBinCount);
	
	let historyBuffer = [];
	//create empty historyBuffer
	for (let i = 0; historyBuffer.length < offLineObj.MAX_COLLECT_SIZE; i++) {
		historyBuffer.push(1);
	}

	//offlineCtx Analysis => 解码 + 渲染
	LoadBuffer(offlineCtx, musicSrc, function onDecode(buffer) {
		let destination = offlineCtx.destination;

		let offSource = offlineCtx.createBufferSource();
		offSource.buffer = buffer;

		//低通滤波器先走一波
		let lowpass = offlineCtx.createBiquadFilter();
		lowpass.type = "lowpass";
		lowpass.frequency.value = 150;//高于150的直接pass
		lowpass.Q.value = 1;

		offSource.connect(lowpass);

		//高通滤波器再来一遭
		let highpass = offlineCtx.createBiquadFilter();
		highpass.type = "highpass";
		highpass.frequency.value = 100;//低于100的直接pass
		highpass.Q.value = 1;//Quality

		lowpass.connect(highpass);

		highpass.connect(offlineCtx.destination);

		offSource.start(0);

		//offlineCtx 尽快渲染，渲染完需要数据进行全曲分析
		//Todo => 精度问题
		offlineCtx.startRendering().then(function (renderedBuffer) {
			console.log("渲染完毕");
			let peaks = GetPeaks([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)]);//双声道
			peaks.forEach(function (peak) {//将peaks信息进行绘制
				bigBeatArr.push(Math.round(peak.position / buffer.length * 10000));
			});
			console.log(bigBeatArr);
			tick();
			analysisFin();
		})
	});

	//触发事件
	function tick() {
		let now = Math.round(audio.currentTime / audio.duration * 10000);
		if (bigBeatArr.includes(now)) {
			if(oldNow === now) return;//防止触发两次
			oldNow = now;
			onBigBeat();
		};

		if(isOnBeat(audioCtx, analyser, levels, historyBuffer, bpmTable, offLineObj)){
			onBeat();
		}
		requestAnimationFrame(tick);
	}
}

function LoadBuffer(audioCtx, url, onLoad, onError) {
	onLoad = onLoad || function (buffer) { }
	onError = onError || function () { }

	let request;
	if (url instanceof Blob) {
		request = new FileReader();
	} else {
		request = new XMLHttpRequest()
		request.open('GET', url, true)
		request.responseType = 'arraybuffer'
	}

	request.onload = function () {
		audioCtx.decodeAudioData(request.response, function (buffer) {//解码
			// callback
			onLoad(buffer)
		}, function () {
			// callback
			onError()
		})
	}
	request.send()
}

//Learn from https://github.com/JMPerez/beats-audio-api/blob/gh-pages/script.js
function GetPeaks(data) {
	let partSize = 22050,
		parts = data[0].length / partSize,
		peaks = [];

	for (let i = 0; i < parts; i++) {//分块处理
		let max = 0;
		for (let j = i * partSize; j < (i + 1) * partSize; j++) {
			let volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
			if (!max || (volume > max.volume)) {
				max = {
					position: j,
					volume: volume
				};
			}
		}
		peaks.push(max);// 0.5秒里要么有一个(取0.5秒里最大的)要么一个都没有
	}

	// We then sort the peaks according to volume...

	peaks.sort(function (a, b) {//顺序排序
		return b.volume - a.volume;
	});

	// ...take the loundest half of those...

	peaks = peaks.splice(0, peaks.length * 0.5);//取后一半

	// ...and re-sort it back based on position.

	peaks.sort(function (a, b) {//按位置重新排好
		return a.position - b.position;
	});

	return peaks;
}

//Learn from https://github.com/stasilo/BeatDetector/blob/master/beatdetector.js
function isOnBeat(context, analyser, levels, historyBuffer, bpmTable, offLineObj) {
	
	let MAX_COLLECT_SIZE = offLineObj.MAX_COLLECT_SIZE;

	analyser.getByteFrequencyData(levels);
	let instantEnergy = 0;
	for (let i = 0; i < levels.length; i++) {
		instantEnergy += levels[i];;
	}
	let localAverageEnergy = 0;
	let instantCounter = 0;
	let isBeat = false;
	// fill history buffer 
	for (let i = 0; i < levels.length - 1; i++ , ++instantCounter) {
		historyBuffer.push(levels[i]);  //add sample to historyBuffer
	}
	//sensitivity of detection
	let sens = 1 + 0.05; //Todo 参数化
	if (instantCounter > 0 && historyBuffer.length > MAX_COLLECT_SIZE - 1) {

		instantEnergy = instantEnergy / (analyser.fftSize / 2);

		let average = 0;
		for (let i = 0; i < historyBuffer.length - 1; i++) {
			average += historyBuffer[i];
		}

		localAverageEnergy = average / historyBuffer.length;

		let timeDiff = context.currentTime - offLineObj.prevTime;
		// timeDiff > 2 is out of normal song bpm range, but if it is a multiple of range [0.3, 1.5] 
		// we probably have missed a beat before but now have a match in the bpm table.

		if (timeDiff > 2 && bpmTable.length > 0) {
			//console.log("timediff is now greater than 3");

			//check if we have a multiple of range in bpm table

			for (let j = 0; j < bpmTable.length - 1; j++) {
				// mutiply by 10 to avoid float rounding errors
				let timeDiffInteger = Math.round((timeDiff / bpmTable[j]['time']) * 1000);

				// timeDiffInteger should now be a multiple of a number in range [3, 15] 
				// if we have a match

				if (timeDiffInteger % (Math.round(bpmTable[j]['time']) * 1000) == 0) {
					timeDiff = new Number(bpmTable[j]['time']);
					//console.log("TIMEDIFF MULTIPLE MATCH: " + timeDiff);
				}
			}
		}


		//still?
		if (timeDiff > 3) {
			offLineObj.prevTime = timeDiff = 0;
		}

		////////////////////////
		// MAIN BPM HIT CHECK //
		////////////////////////

		// CHECK IF WE HAVE A BEAT BETWEEN 200 AND 40 BPM (every 0.29 to 2s), or else ignore it.
		// Also check if we have _any_ found prev beats
		if (context.currentTime > 0.29 && instantEnergy > localAverageEnergy &&
			(instantEnergy > (sens * localAverageEnergy)) &&
			((timeDiff < 2.0 && timeDiff > 0.29) || offLineObj.prevTime == 0)) {

			isBeat = true;

			offLineObj.prevTime = context.currentTime;

			let bpm =
				{
					time: timeDiff.toFixed(3),
					counter: 1,
				};


			//TODO
			for (let j = 0; j < bpmTable.length; j++) {
				//FOUND ANOTHER MATCH FOR ALREADY GUESSED BEAT

				if (bpmTable[j]['time'] == bpm['time']) {
					bpmTable[j]['counter']++;
					bpm = 0;

					if (bpmTable[j]['counter'] > 3 && j < 2) {
						isBeat = true;
						//console.log("WE HAVE A BEAT MATCH IN TABLE!!!!!!!!!!");
					}

					break;
				}
			}

			if (bpm != 0 || bpmTable.length == 0) {
				bpmTable.push(bpm);
			}

			//sort and draw 10 most current bpm-guesses
			bpmTable.sort(function (a, b) {
				return b['counter'] - a['counter']; //descending sort
			});
		}
		let temp = historyBuffer.slice(0); //get copy of buffer

		historyBuffer = []; //clear buffer

		// make room in array by deleting the last COLLECT_SIZE samples.
		historyBuffer = temp.slice((analyser.fftSize / 2), temp.length);

		instantCounter = 0;
		instantEnergy = 0;

		localAverageEnergy = 0;
	}

	return isBeat;
}
//export default BeatDetector;