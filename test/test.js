import BeatDetector from '../BeatDetector';
import { expect } from 'chai';

describe('BeatDetector：功能测试', function () {
    it('初始化：成功', function () {

        function analysisFin() {
            return "初始化完成";
        }
        expect(BeatDetector(null, analysisFin)).to.be.equal('缺少参数');
    });
});