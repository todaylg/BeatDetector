# BeatDetector.js

[![npm](https://img.shields.io/npm/v/beatdetector.svg?style=flat-square)](https://www.npmjs.com/package/beatdetector)[![npm](https://img.shields.io/npm/l/beatdetector.svg?style=flat-square)](https://github.com/todaylg/BeatDetector/blob/master/LICENSE)

<h2>Usage</h2>

```html

 <audio id="audioEle" src="./test.mp3"></audio>
 <script src="../BeatDetector.js"></script>
 <script>
    let audioEle = document.getElementById("audioEle");
    
    BeatDetector(audioEle, analysisFin, onBeat, onBigBeat);
    
    function analysisFin(){
        audioEle.play();
    }
    
    function onBeat(){
        console.log("Emit Beat");
    }

    function onBigBeat(){
        console.log("Wow!! Emit BigBeat");
    }
 </script>

```
