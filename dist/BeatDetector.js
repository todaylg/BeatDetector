'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

if (typeof window != 'undefined') {
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	window.OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
}

var BeatDetector = function () {
	function BeatDetector(audio, analysisFin, onBeat, onBigBeat) {
		var _this2 = this;

		_classCallCheck(this, BeatDetector);

		if (!audio) return '缺少参数';
		audio.oncanplaythrough = function () {
			_this2.init(audio, analysisFin, onBeat, onBigBeat);
		};
	}

	_createClass(BeatDetector, [{
		key: 'init',
		value: function init(audio, analysisFin, onBeat, onBigBeat) {
			var _this = this;
			//参数验证
			analysisFin = analysisFin || function () {};
			onBeat = onBeat || function () {};
			onBigBeat = onBigBeat || function () {};

			var bigBeatArr = [],
			    audioLength = audio.duration,
			    musicSrc = audio.getAttribute('src');

			//OnLine/OffLine audioCtx
			var audioCtx = new AudioContext();
			var offlineCtx = new OfflineAudioContext(2, audioLength * 44100, 44100); //numOfChannels,length,sampleRate

			//OnLine Analysis
			var analyser = audioCtx.createAnalyser(); //TODO Analyser的参数应可定制,先默认吧
			var source = audioCtx.createMediaElementSource(audio); //Ctx接管AudioEle
			source.connect(analyser);
			analyser.connect(audioCtx.destination);

			var offLineObj = {}; //传递值引用
			offLineObj.prevTime = 0;
			offLineObj.MAX_COLLECT_SIZE = 43 * (analyser.fftSize / 2); //44032 1s(44100/1024=43次fft,也就是43个levels更新)

			//防止重复触发
			var oldNow = 0;

			var levels = new Uint8Array(analyser.frequencyBinCount);

			this.historyBuffer = [];
			//create empty historyBuffer
			for (var i = 0; this.historyBuffer.length < offLineObj.MAX_COLLECT_SIZE; i++) {
				this.historyBuffer.push(1);
			}

			//offlineCtx Analysis => 解码 + 渲染
			_this.LoadBuffer(offlineCtx, musicSrc, function onDecode(buffer) {
				var destination = offlineCtx.destination;

				var offSource = offlineCtx.createBufferSource();
				offSource.buffer = buffer;

				//低通滤波器先走一波
				var lowpass = offlineCtx.createBiquadFilter();
				lowpass.type = "lowpass";
				lowpass.frequency.value = 150; //高于150的直接pass
				lowpass.Q.value = 1;

				offSource.connect(lowpass);

				//高通滤波器再来一遭
				var highpass = offlineCtx.createBiquadFilter();
				highpass.type = "highpass";
				highpass.frequency.value = 100; //低于100的直接pass
				highpass.Q.value = 1; //Quality

				lowpass.connect(highpass);

				highpass.connect(destination);

				offSource.start(0);

				//offlineCtx 尽快渲染，渲染完需要数据进行全曲分析
				//Todo => 精度问题
				offlineCtx.startRendering().then(function (renderedBuffer) {
					var peaks = _this.GetPeaks([renderedBuffer.getChannelData(0), renderedBuffer.getChannelData(1)]); //双声道
					peaks.forEach(function (peak) {
						//将peaks信息进行绘制
						bigBeatArr.push(Math.round(peak.position / buffer.length * 10000));
					});
					tick();
					analysisFin();
				});
			});

			//触发事件
			var tick = function tick() {
				var now = Math.round(audio.currentTime / audio.duration * 10000);
				if (bigBeatArr.includes(now) && oldNow != now) {
					//防止触发两次
					oldNow = now;
					onBigBeat();
				};
				if (_this.isOnBeat(audioCtx, analyser, levels, _this.historyBuffer, offLineObj)) {
					onBeat();
				}
				requestAnimationFrame(tick);
			};
		}
	}, {
		key: 'LoadBuffer',
		value: function LoadBuffer(audioCtx, url, onLoad, onError) {
			onLoad = onLoad || function () {};
			onError = onError || function () {};

			var request = void 0;
			if (url instanceof Blob) {
				request = new FileReader();
			} else {
				request = new XMLHttpRequest();
				request.open('GET', url, true);
				request.responseType = 'arraybuffer';
			}

			request.onload = function () {
				audioCtx.decodeAudioData(request.response, function (buffer) {
					//解码
					// callback
					onLoad(buffer);
				}, function () {
					// callback
					onError();
				});
			};
			request.send();
		}

		//Learn from https://github.com/JMPerez/beats-audio-api/blob/gh-pages/script.js

	}, {
		key: 'GetPeaks',
		value: function GetPeaks(data) {
			var partSize = 22050,
			    parts = data[0].length / partSize,
			    peaks = [];

			for (var i = 0; i < parts; i++) {
				//分块处理
				var max = 0;
				for (var j = i * partSize; j < (i + 1) * partSize; j++) {
					var volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
					if (!max || volume > max.volume) {
						max = {
							position: j,
							volume: volume
						};
					}
				}
				peaks.push(max);
			}

			// We then sort the peaks according to volume...
			peaks.sort(function (a, b) {
				//顺序排序
				return b.volume - a.volume;
			});

			// ...take the loundest half of those...
			peaks = peaks.splice(0, peaks.length * 0.5); //取后一半

			// ...and re-sort it back based on position.
			peaks.sort(function (a, b) {
				//按位置重新排好
				return a.position - b.position;
			});

			return peaks;
		}

		//Learn from https://github.com/stasilo/BeatDetector/blob/master/beatdetector.js

	}, {
		key: 'isOnBeat',
		value: function isOnBeat(context, analyser, levels, historyBuffer, offLineObj) {
			var MAX_COLLECT_SIZE = offLineObj.MAX_COLLECT_SIZE;
			analyser.getByteFrequencyData(levels);
			var localAverageEnergy = 0,
			    instantCounter = 0,
			    instantEnergy = 0;
			var isBeat = false;
			// fill history buffer 
			for (var i = 0; i < levels.length; i++, ++instantCounter) {
				historyBuffer.push(levels[i]); //add sample to historyBuffer
				instantEnergy += levels[i];
			}
			//sensitivity of detection
			var sens = 1.05;
			if (instantCounter > 0 && historyBuffer.length > MAX_COLLECT_SIZE - 1) {

				instantEnergy = instantEnergy / (analyser.fftSize / 2);

				var average = 0;
				for (var _i = 0; _i < historyBuffer.length - 1; _i++) {
					average += historyBuffer[_i];
				}

				localAverageEnergy = average / historyBuffer.length;

				var timeDiff = context.currentTime - offLineObj.prevTime;

				if (timeDiff > 3) {
					offLineObj.prevTime = timeDiff = 0;
				}
				if (timeDiff > 0.5 && timeDiff < 1) {
					sens -= (sens - 1) * (timeDiff - 0.5) / 0.5;
				}
				if (context.currentTime > 0.29 && instantEnergy > localAverageEnergy && instantEnergy > sens * localAverageEnergy && (timeDiff < 1.0 && timeDiff > 0.29 || offLineObj.prevTime == 0)) {

					isBeat = true;

					offLineObj.prevTime = context.currentTime;
				}
				var temp = historyBuffer.slice(0); //get copy of buffer

				this.historyBuffer = []; //clear buffer

				this.historyBuffer = temp.slice(analyser.fftSize / 2, temp.length);
			}

			return isBeat;
		}
	}]);

	return BeatDetector;
}();