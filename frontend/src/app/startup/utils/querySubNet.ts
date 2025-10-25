import { base_path, port } from './consts';

export function querySubNet(subNet: string): Promise<string> {
  return new Promise(function (resolve, reject) {
    Promise.all(
      Array.from({ length: 256 }, (_, i) => i).map(i => {
        const ip = `${subNet}.${i}`;
        return fetch(`http://${ip}:${port}/${base_path}/ping`)
          .then(res => res.json())
          .then(({ status }) => {
            if (status === 'OK') {
              resolve(`http://${ip}:${port}/${base_path}`);
            }
          })
          .catch(() => '');
      })
    ).then(() => {
      reject('Server not found');
    });
  });
}
