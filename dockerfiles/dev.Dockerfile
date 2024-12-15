FROM node:22

WORKDIR /miauflix

COPY package.json yarn.lock ./
RUN yarn install
COPY . ./

CMD npm run backend:dev --host=0.0.0.0
